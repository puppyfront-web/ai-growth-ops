import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getPlatformProvider } from '@ai-growth-ops/providers';
import { loadRuntimeConfig } from '../config/runtime-config.js';
import { SOCIAL_PUBLISH_DIR_MAP } from './delivery-tools.js';

interface StorageStateCookie {
  name: string;
  value: string;
}

interface StorageStateFile {
  cookies?: StorageStateCookie[];
}

export function resolveSharedAccountForPlatform(
  platform: string,
  account?: string,
): string | undefined {
  if (account?.trim()) return account.trim();

  const config = loadRuntimeConfig();
  const sharedAccountMap: Record<string, string> = {
    douyin: config.sharedAccounts.douyin,
    kuaishou: config.sharedAccounts.kuaishou,
    wechat_channels: config.sharedAccounts.wechat_channels,
    xiaohongshu: config.sharedAccounts.xiaohongshu,
    wechat_official: config.sharedAccounts.wechat_official,
    zhihu: config.sharedAccounts.zhihu,
    baijiahao: config.sharedAccounts.baijiahao,
  };

  return sharedAccountMap[platform];
}

export async function storageStateToCookieHeader(path: string): Promise<string | null> {
  return storageStateToCookieHeaderFromRaw(await readFile(path, 'utf8'));
}

async function readStorageStatePayload(
  platform: string,
  account?: string,
): Promise<string | null> {
  const envMap: Record<string, string | undefined> = {
    douyin: process.env.AI_GROWTH_OPS_DOUYIN_COOKIE,
    xiaohongshu: process.env.AI_GROWTH_OPS_XIAOHONGSHU_COOKIE,
    wechat_official: process.env.AI_GROWTH_OPS_WECHAT_OFFICIAL_COOKIE,
    wechat_channels: process.env.AI_GROWTH_OPS_WECHAT_CHANNELS_COOKIE,
    kuaishou: process.env.AI_GROWTH_OPS_KUAISHOU_COOKIE,
    zhihu: process.env.AI_GROWTH_OPS_ZHIHU_COOKIE,
    baijiahao: process.env.AI_GROWTH_OPS_BAIJIAHAO_COOKIE,
  };

  const fromEnv = envMap[platform];
  if (fromEnv?.trim()) return fromEnv.trim();

  const mapped = SOCIAL_PUBLISH_DIR_MAP[platform] ?? null;
  const resolvedAccount = resolveSharedAccountForPlatform(platform, account);
  if (!mapped || !resolvedAccount) return null;

  const root = process.env.SOCIAL_PUBLISH_DATA_DIR ?? join(process.env.HOME ?? '', '.social-publish-skills');
  const path = join(root, 'cookies', mapped, `${resolvedAccount}.json`);
  if (!existsSync(path)) return null;

  return readFile(path, 'utf8');
}

export async function resolveCookieForPlatform(
  platform: string,
  account?: string,
): Promise<string | null> {
  const payload = await readStorageStatePayload(platform, account);
  if (!payload) return null;
  if (payload.trim().startsWith('{')) {
    return await storageStateToCookieHeaderFromRaw(payload);
  }
  return payload.trim();
}

/** Prefer full Playwright storageState JSON for browser-runner (keeps per-domain cookies). */
export async function resolveAuthStateForPlatform(
  platform: string,
  account?: string,
): Promise<string | null> {
  return readStorageStatePayload(platform, account);
}

async function storageStateToCookieHeaderFromRaw(raw: string): Promise<string | null> {
  let parsed: StorageStateFile;
  try {
    parsed = JSON.parse(raw) as StorageStateFile;
  } catch {
    return null;
  }
  const cookies = parsed.cookies ?? [];
  if (!cookies.length) return null;
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

export async function validateCookieCredential(
  platform: string,
  account?: string,
): Promise<{
  valid: boolean;
  platform: string;
  cookie: string | null;
  error?: string;
}> {
  const cookie = await resolveCookieForPlatform(platform, account);
  if (!cookie) {
    return {
      valid: false,
      platform,
      cookie: null,
      error: 'cookie_not_found',
    };
  }

  try {
    const provider = getPlatformProvider(platform);
    const result = await provider.validateCredentials({
      authType: 'cookie',
      cookie,
    });

    return {
      valid: result.valid,
      platform,
      cookie,
      error: result.error,
    };
  } catch (error) {
    return {
      valid: false,
      platform,
      cookie,
      error: error instanceof Error ? error.message : 'unknown_error',
    };
  }
}
