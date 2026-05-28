import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getPlatformProvider } from '@ai-growth-ops/providers';
import { loadRuntimeConfig } from '../config/runtime-config.js';

interface StorageStateCookie {
  name: string;
  value: string;
}

interface StorageStateFile {
  cookies?: StorageStateCookie[];
}

function mapPlatformToSocialPublishDir(platform: string): string | null {
  if (platform === 'douyin') return 'douyin';
  if (platform === 'kuaishou') return 'kuaishou';
  if (platform === 'wechat_channels') return 'tencent';
  return null;
}

export async function storageStateToCookieHeader(path: string): Promise<string | null> {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as StorageStateFile;
  const cookies = parsed.cookies ?? [];
  if (!cookies.length) return null;
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

export async function resolveCookieForPlatform(
  platform: string,
  account?: string,
): Promise<string | null> {
  const envMap: Record<string, string | undefined> = {
    douyin: process.env.AI_GROWTH_OPS_DOUYIN_COOKIE,
    xiaohongshu: process.env.AI_GROWTH_OPS_XIAOHONGSHU_COOKIE,
    wechat_channels: process.env.AI_GROWTH_OPS_WECHAT_CHANNELS_COOKIE,
    kuaishou: process.env.AI_GROWTH_OPS_KUAISHOU_COOKIE,
  };

  const fromEnv = envMap[platform];
  if (fromEnv?.trim()) return fromEnv.trim();

  const mapped = mapPlatformToSocialPublishDir(platform);
  if (!mapped || !account) return null;

  const config = loadRuntimeConfig();
  const root = process.env.SOCIAL_PUBLISH_DATA_DIR ?? join(process.env.HOME ?? '', '.social-publish-skills');
  const path = join(root, 'cookies', mapped, `${account}.json`);
  if (!existsSync(path)) return null;

  return storageStateToCookieHeader(path);
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
