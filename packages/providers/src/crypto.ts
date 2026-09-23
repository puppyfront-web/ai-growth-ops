import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  scryptSync
} from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const LOCAL_REFERENCE_PREFIX = 'local-secret:v1:';
const LOCAL_REFERENCE_PATTERN = /^local-secret:v1:([0-9a-f-]{36})$/;

function getKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY env var is required');
  return scryptSync(secret, 'ai-growth-ops-salt', 32);
}

function encryptValue(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptValue(encrypted: string): string {
  const key = getKey();
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split(':');
  if (!ivB64 || !authTagB64 || !ciphertextB64)
    throw new Error('Invalid encrypted token format');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

function localDataDir(): string | null {
  const configured = process.env.LOCAL_DATA_DIR?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'test') return null;
  return join(homedir(), '.ai-growth-ops');
}

export function isLocalSecretReference(value: string): boolean {
  return LOCAL_REFERENCE_PATTERN.test(value);
}

export function encryptToken(plaintext: string): string {
  const dataDir = localDataDir();
  if (!dataDir) return encryptValue(plaintext);

  const id = randomUUID();
  const secretsDir = join(dataDir, 'secrets');
  const target = join(secretsDir, `${id}.secret`);
  const temporary = `${target}.tmp`;
  mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
  writeFileSync(temporary, encryptValue(plaintext), {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600
  });
  renameSync(temporary, target);
  return `${LOCAL_REFERENCE_PREFIX}${id}`;
}

export function decryptToken(encrypted: string): string {
  if (!encrypted.startsWith(LOCAL_REFERENCE_PREFIX)) {
    return decryptValue(encrypted);
  }

  const match = LOCAL_REFERENCE_PATTERN.exec(encrypted);
  if (!match) throw new Error('Invalid local secret reference');
  const dataDir = localDataDir();
  if (!dataDir) throw new Error('LOCAL_DATA_DIR is required for local secrets');
  const stored = readFileSync(
    join(dataDir, 'secrets', `${match[1]}.secret`),
    'utf8'
  );
  return decryptValue(stored);
}

export function moveTokenToLocalStorage(encrypted: string): string {
  if (isLocalSecretReference(encrypted)) return encrypted;
  if (!process.env.LOCAL_DATA_DIR?.trim()) {
    throw new Error('LOCAL_DATA_DIR is required to migrate secrets');
  }
  return encryptToken(decryptValue(encrypted));
}
