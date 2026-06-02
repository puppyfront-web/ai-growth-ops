import { createHmac, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { DatabaseClient } from '@ai-growth-ops/database';

let _authSecret: string | null = null;
function getAuthSecret(): string {
  if (!_authSecret) {
    _authSecret = process.env.AUTH_SECRET || null;
    if (!_authSecret) {
      throw new Error('AUTH_SECRET environment variable is not set. Refusing to operate with insecure defaults.');
    }
  }
  return _authSecret;
}
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Password ─────────────────────────────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
  } catch {
    return false;
  }
}

// ── Token ─────────────────────────────────────────────────────────────────────

interface TokenPayload {
  userId: string;
  issuedAt: number;
  jti: string;
}

export function createToken(userId: string): string {
  const payload: TokenPayload = { userId, issuedAt: Date.now(), jti: randomUUID() };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', getAuthSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;

  const expected = createHmac('sha256', getAuthSecret()).update(data).digest('base64url');
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as TokenPayload;
    if (Date.now() - payload.issuedAt > TOKEN_TTL_MS) return null;
    if (!payload.jti) return null; // legacy tokens without jti are rejected
    return payload;
  } catch {
    return null;
  }
}

// ── Token Blacklist ───────────────────────────────────────────────────────────

export async function isTokenRevoked(db: DatabaseClient, jti: string): Promise<boolean> {
  const entry = await db.tokenBlacklist.findUnique({ where: { jti } });
  return entry !== null;
}

export async function revokeToken(db: DatabaseClient, token: string): Promise<void> {
  const payload = verifyToken(token);
  if (!payload) return;
  await db.tokenBlacklist.create({
    data: {
      jti: payload.jti,
      userId: payload.userId,
      expiresAt: new Date(payload.issuedAt + TOKEN_TTL_MS),
    },
  }).catch(() => {
    // already revoked — ignore duplicate
  });
}

export async function revokeAllUserTokens(db: DatabaseClient, userId: string): Promise<number> {
  // Find all active tokens for a user — since tokens are stateless, we create
  // a "blanket revocation" entry with a special jti prefix
  const jti = `revoke-all:${userId}:${Date.now()}`;
  await db.tokenBlacklist.create({
    data: {
      jti,
      userId,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  return 1;
}

// ── Password Reset Token ──────────────────────────────────────────────────────

export function generateResetToken(): string {
  return randomBytes(32).toString('hex');
}

export async function createPasswordResetToken(db: DatabaseClient, userId: string): Promise<string> {
  const token = generateResetToken();
  await db.passwordResetToken.create({
    data: {
      userId,
      token,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    },
  });
  return token;
}

export async function verifyPasswordResetToken(db: DatabaseClient, token: string): Promise<string | null> {
  const entry = await db.passwordResetToken.findUnique({ where: { token } });
  if (!entry) return null;
  if (entry.usedAt) return null;
  if (entry.expiresAt < new Date()) return null;
  return entry.userId;
}

export async function markResetTokenUsed(db: DatabaseClient, token: string): Promise<void> {
  await db.passwordResetToken.update({
    where: { token },
    data: { usedAt: new Date() },
  });
}

// ── Email Verification Token ──────────────────────────────────────────────────

export async function createEmailVerificationToken(db: DatabaseClient, userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await db.emailVerificationToken.create({
    data: {
      userId,
      token,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },
  });
  return token;
}

export async function verifyEmailVerificationToken(db: DatabaseClient, token: string): Promise<string | null> {
  const entry = await db.emailVerificationToken.findUnique({ where: { token } });
  if (!entry) return null;
  if (entry.verifiedAt) return null;
  if (entry.expiresAt < new Date()) return null;
  return entry.userId;
}

export async function markEmailVerified(db: DatabaseClient, token: string): Promise<void> {
  const entry = await db.emailVerificationToken.findUnique({ where: { token } });
  if (!entry) return;
  await db.$transaction([
    db.emailVerificationToken.update({
      where: { token },
      data: { verifiedAt: new Date() },
    }),
    db.user.update({
      where: { id: entry.userId },
      data: { emailVerifiedAt: new Date() },
    }),
  ]);
}

// ── Cleanup expired tokens (called periodically) ─────────────────────────────

export async function cleanupExpiredTokens(db: DatabaseClient): Promise<void> {
  const now = new Date();
  await db.tokenBlacklist.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.emailVerificationToken.deleteMany({ where: { expiresAt: { lt: now } } });
}

// ── Request auth ──────────────────────────────────────────────────────────────

function extractToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export async function getAuthenticatedUser(req: IncomingMessage, db: DatabaseClient) {
  const token = extractToken(req);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  // Check token blacklist
  const revoked = await isTokenRevoked(db, payload.jti);
  if (revoked) return null;

  const user = await db.user.findFirst({
    where: { id: payload.userId, deletedAt: null },
  });
  return user ?? null;
}
