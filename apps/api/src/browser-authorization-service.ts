import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual
} from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import type { DatabaseClient } from '@ai-growth-ops/database';
import { encryptToken } from '@ai-growth-ops/providers';
import {
  createBrowserProfileRef,
  getPlatformAuthorizationAdapter,
  validatePlatformCookie
} from '@ai-growth-ops/shared';

const SESSION_TTL_MS = 10 * 60_000;
const SESSION_REUSE_MS = 15_000;
const ACTIVE_STATUSES = ['waiting_local_bridge', 'waiting_user'];

export class BrowserBridgeError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function tokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function bridgeTokenForSession(sessionId: string): string {
  const secret =
    process.env.TOKEN_ENCRYPTION_KEY?.trim() || process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY env var is required');
  return createHmac('sha256', secret)
    .update(`browser-bridge:${sessionId}`)
    .digest('base64url');
}

export function resolveApiBaseUrl(req: IncomingMessage): string {
  const configured =
    process.env.BROWSER_BRIDGE_API_URL?.trim() || process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto?.split(',')[0]?.trim() || 'http';
  const host = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost?.split(',')[0]?.trim() || req.headers.host;
  if (!host) throw new Error('无法确定 Browser Bridge API 地址');
  return `${protocol}://${host}`;
}

export async function startBrowserAuthorization(
  db: DatabaseClient,
  input: {
    organizationId: string;
    accountId: string;
    platform: string;
    apiBaseUrl: string;
  }
) {
  const adapter = getPlatformAuthorizationAdapter(input.platform);
  const now = new Date();
  const reusableAfter = new Date(now.getTime() - SESSION_REUSE_MS);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const session = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.accountId}))`;
    const reusable = await tx.browserSession.findFirst({
      where: {
        organizationId: input.organizationId,
        platformAccountId: input.accountId,
        provider: 'local_bridge',
        status: 'waiting_local_bridge',
        createdAt: { gte: reusableAfter }
      },
      orderBy: { createdAt: 'desc' }
    });
    if (reusable) {
      const bridgeToken = bridgeTokenForSession(reusable.id);
      return tx.browserSession.update({
        where: { id: reusable.id },
        data: { bridgeTokenHash: hashToken(bridgeToken), expiresAt }
      });
    }

    await tx.browserSession.updateMany({
      where: {
        organizationId: input.organizationId,
        platformAccountId: input.accountId,
        provider: 'local_bridge',
        status: { in: ACTIVE_STATUSES }
      },
      data: {
        status: 'cancelled',
        cancelledAt: now,
        endedAt: now,
        bridgeTokenHash: null
      }
    });

    const sessionId = randomUUID();
    const bridgeToken = bridgeTokenForSession(sessionId);
    return tx.browserSession.create({
      data: {
        id: sessionId,
        organizationId: input.organizationId,
        platform: input.platform,
        platformAccountId: input.accountId,
        provider: 'local_bridge',
        status: 'waiting_local_bridge',
        bridgeTokenHash: hashToken(bridgeToken),
        expiresAt,
        startedAt: now,
        metadata: {
          profileRef: createBrowserProfileRef(input.platform, input.accountId)
        }
      }
    });
  });
  const bridgeToken = bridgeTokenForSession(session.id);

  const launchUrl = new URL('aigrowthops://authorize');
  launchUrl.searchParams.set('api', input.apiBaseUrl);
  launchUrl.searchParams.set('session', session.id);
  launchUrl.searchParams.set('token', bridgeToken);
  const installerUrl = process.env.BROWSER_ASSISTANT_DOWNLOAD_URL?.trim();

  return {
    sessionId: session.id,
    status: 'waiting_local_bridge' as const,
    expiresAt: expiresAt.toISOString(),
    launchUrl: launchUrl.toString(),
    ...(installerUrl ? { installerUrl } : {}),
    loginUrl: adapter.loginUrl
  };
}

export async function getBrowserAuthorizationStatus(
  db: DatabaseClient,
  organizationId: string,
  accountId: string
) {
  const session = await db.browserSession.findFirst({
    where: { organizationId, platformAccountId: accountId, provider: 'local_bridge' },
    orderBy: { createdAt: 'desc' }
  });
  if (!session) {
    return { status: 'error' as const, error: '登录会话不存在，请重新授权' };
  }
  if (
    ACTIVE_STATUSES.includes(session.status) &&
    session.expiresAt &&
    session.expiresAt.getTime() <= Date.now()
  ) {
    await db.browserSession.update({
      where: { id: session.id },
      data: {
        status: 'expired',
        endedAt: new Date(),
        bridgeTokenHash: null
      }
    });
    return { status: 'expired' as const, error: '授权会话已过期，请重新授权' };
  }
  return {
    status: session.status,
    ...(session.expiresAt ? { expiresAt: session.expiresAt.toISOString() } : {}),
    ...(session.errorMessage ? { error: session.errorMessage } : {})
  };
}

export async function cancelBrowserAuthorization(
  db: DatabaseClient,
  organizationId: string,
  accountId: string
): Promise<void> {
  const now = new Date();
  await db.browserSession.updateMany({
    where: {
      organizationId,
      platformAccountId: accountId,
      provider: 'local_bridge',
      status: { in: ACTIVE_STATUSES }
    },
    data: {
      status: 'cancelled',
      cancelledAt: now,
      endedAt: now,
      bridgeTokenHash: null
    }
  });
}

function bearerToken(req: IncomingMessage): string {
  const authorization = req.headers.authorization ?? '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
}

async function requireBridgeSession(
  db: DatabaseClient,
  req: IncomingMessage,
  sessionId: string
) {
  const token = bearerToken(req);
  const session = await db.browserSession.findUnique({ where: { id: sessionId } });
  if (
    !token ||
    !session?.bridgeTokenHash ||
    !tokenMatches(token, session.bridgeTokenHash)
  ) {
    throw new BrowserBridgeError(401, 'BRIDGE_TOKEN_INVALID', 'Bridge Token 无效');
  }
  if (!ACTIVE_STATUSES.includes(session.status)) {
    throw new BrowserBridgeError(409, 'BRIDGE_SESSION_CLOSED', '授权会话已结束');
  }
  if (!session.expiresAt || session.expiresAt.getTime() <= Date.now()) {
    await db.browserSession.update({
      where: { id: session.id },
      data: {
        status: 'expired',
        endedAt: new Date(),
        bridgeTokenHash: null
      }
    });
    throw new BrowserBridgeError(410, 'BRIDGE_SESSION_EXPIRED', '授权会话已过期');
  }
  return session;
}

export async function claimBrowserAuthorization(
  db: DatabaseClient,
  req: IncomingMessage,
  sessionId: string
) {
  const session = await requireBridgeSession(db, req, sessionId);
  const adapter = getPlatformAuthorizationAdapter(session.platform);
  const claimedAt = session.claimedAt ?? new Date();
  await db.browserSession.update({
    where: { id: session.id },
    data: { status: 'waiting_user', claimedAt }
  });
  return {
    sessionId: session.id,
    platformAccountId: session.platformAccountId,
    platform: session.platform,
    status: 'waiting_user' as const,
    loginUrl: adapter.loginUrl,
    allowedOrigins: adapter.allowedOrigins,
    cookieDomains: adapter.cookieDomains,
    requiredCookieNames: adapter.requiredCookieNames,
    cookieNames: adapter.cookieNames,
    profileRef: createBrowserProfileRef(session.platform, session.platformAccountId),
    expiresAt: session.expiresAt!.toISOString()
  };
}

function filterCookieHeader(rawCookie: string, allowedNames: readonly string[]): string {
  const allowed = new Set(allowedNames);
  return rawCookie
    .split(';')
    .map((part) => part.trim())
    .filter((part) => allowed.has(part.split('=', 1)[0] ?? ''))
    .join('; ');
}

export async function completeBrowserAuthorization(
  db: DatabaseClient,
  req: IncomingMessage,
  sessionId: string,
  rawCookie: string
) {
  const session = await requireBridgeSession(db, req, sessionId);
  if (session.status !== 'waiting_user') {
    throw new BrowserBridgeError(
      409,
      'BRIDGE_SESSION_NOT_CLAIMED',
      '请先由本地 Browser Bridge 领取授权会话'
    );
  }
  const adapter = getPlatformAuthorizationAdapter(session.platform);
  const filteredCookie = filterCookieHeader(rawCookie, adapter.cookieNames);
  const validated = validatePlatformCookie(session.platform, filteredCookie);
  if (!validated.valid) {
    throw new BrowserBridgeError(
      400,
      'REQUIRED_COOKIE_MISSING',
      validated.error
    );
  }
  if (!session.organizationId) {
    throw new BrowserBridgeError(
      409,
      'BRIDGE_SESSION_INVALID',
      '授权会话缺少组织归属'
    );
  }
  const account = await db.platformAccount.findFirst({
    where: {
      id: session.platformAccountId,
      organizationId: session.organizationId,
      deletedAt: null
    }
  });
  if (!account) {
    throw new BrowserBridgeError(404, 'ACCOUNT_NOT_FOUND', '授权账号不存在');
  }
  const now = new Date();
  await db.$transaction([
    db.platformAccount.update({
      where: { id: account.id },
      data: {
        cookieRef: encryptToken(validated.cookie),
        authType: 'cookie',
        mode: 'browser_assist',
        status: 'active',
        lastHealthCheckAt: now
      }
    }),
    db.browserSession.update({
      where: { id: session.id },
      data: {
        status: 'logged_in',
        completedAt: now,
        endedAt: now,
        bridgeTokenHash: null,
        errorMessage: null
      }
    }),
    db.auditLog.create({
      data: {
        organizationId: account.organizationId,
        userId: account.userId,
        action: 'update',
        entity: 'PlatformAccount',
        entityId: account.id,
        changes: { authType: 'cookie', source: 'local_browser_bridge' }
      }
    })
  ]);
  return { status: 'logged_in' as const };
}

export async function failBrowserAuthorization(
  db: DatabaseClient,
  req: IncomingMessage,
  sessionId: string,
  code: string,
  message: string
) {
  const session = await requireBridgeSession(db, req, sessionId);
  await db.browserSession.update({
    where: { id: session.id },
    data: {
      status: 'error',
      endedAt: new Date(),
      bridgeTokenHash: null,
      errorMessage: message,
      metadata: { errorCode: code }
    }
  });
  return { status: 'error' as const };
}

