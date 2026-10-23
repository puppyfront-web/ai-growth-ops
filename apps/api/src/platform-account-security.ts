import { decryptToken, encryptToken } from '@ai-growth-ops/providers';
import type { Prisma } from '@prisma/client';

type PlatformAccountRecord = Record<string, unknown> & {
  accessTokenEncrypted?: string | null;
  refreshTokenEncrypted?: string | null;
  cookieRef?: string | null;
  metadata?: unknown;
};

const SECRET_METADATA_KEYS = new Set([
  'appSecret',
  'clientSecret',
  'appSecretEncrypted',
  'clientSecretEncrypted'
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function publicValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/(secret|token|cookie|password|credential)/i.test(key))
      .map(([key, nestedValue]) => [key, publicValue(nestedValue)])
  );
}

function publicMetadata(value: unknown): Record<string, unknown> {
  return publicValue(record(value)) as Record<string, unknown>;
}

export function buildPlatformAccountMetadata(
  input: Record<string, unknown>,
  existingMetadata?: unknown
): Prisma.InputJsonObject {
  const existing = record(existingMetadata);
  const submitted = record(input.metadata);
  const metadata = {
    ...publicMetadata(existing),
    ...publicMetadata(submitted)
  };

  for (const key of ['appSecret', 'clientSecret'] as const) {
    const value = input[key] ?? submitted[key];
    const encryptedKey = `${key}Encrypted`;
    if (typeof value === 'string' && value.length > 0) {
      metadata[encryptedKey] = encryptToken(value);
    } else if (typeof existing[encryptedKey] === 'string') {
      metadata[encryptedKey] = existing[encryptedKey];
    } else if (typeof existing[key] === 'string' && existing[key].length > 0) {
      metadata[encryptedKey] = encryptToken(existing[key]);
    }
  }

  return metadata as Prisma.InputJsonObject;
}

export function readPlatformAccountSecret(
  metadata: unknown,
  key: 'appSecret' | 'clientSecret'
): string | undefined {
  const values = record(metadata);
  const encrypted = values[`${key}Encrypted`];
  if (typeof encrypted === 'string' && encrypted.length > 0) {
    return decryptToken(encrypted);
  }
  const legacy = values[key];
  return typeof legacy === 'string' && legacy.length > 0 ? legacy : undefined;
}

export function toPlatformAccountDto(account: PlatformAccountRecord) {
  const {
    accessTokenEncrypted,
    refreshTokenEncrypted,
    cookieRef,
    metadata,
    ...safeAccount
  } = account;
  const metadataRecord = record(metadata);

  return {
    ...safeAccount,
    metadata: publicMetadata(metadataRecord),
    hasAccessToken: Boolean(accessTokenEncrypted),
    hasRefreshToken: Boolean(refreshTokenEncrypted),
    hasCookie: Boolean(cookieRef),
    hasSecretConfig: [...SECRET_METADATA_KEYS].some((key) =>
      Boolean(metadataRecord[key])
    )
  };
}
