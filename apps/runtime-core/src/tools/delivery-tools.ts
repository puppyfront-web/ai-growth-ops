import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadRuntimeConfig } from '../config/runtime-config.js';

const SOCIAL_PUBLISH_DIR_MAP: Record<string, string> = {
  douyin: 'douyin',
  kuaishou: 'kuaishou',
  wechat_channels: 'tencent',
};

export async function listAvailableAccounts(): Promise<Record<string, string[]>> {
  const root = process.env.SOCIAL_PUBLISH_DATA_DIR ?? join(process.env.HOME ?? '', '.social-publish-skills');
  const result: Record<string, string[]> = {};

  for (const [platform, dirName] of Object.entries(SOCIAL_PUBLISH_DIR_MAP)) {
    const dir = join(root, 'cookies', dirName);
    if (!existsSync(dir)) {
      result[platform] = [];
      continue;
    }

    const files = await readdir(dir);
    result[platform] = files
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace(/\.json$/, ''));
  }

  return result;
}

export async function getDeliveryDoctorReport(): Promise<Record<string, unknown>> {
  const config = loadRuntimeConfig();
  const accounts = await listAvailableAccounts();

  return {
    nodeVersion: process.version,
    socialPublishSkillsRoot: {
      path: config.socialPublishSkillsRoot ?? null,
      exists: Boolean(config.socialPublishSkillsRoot && existsSync(config.socialPublishSkillsRoot)),
    },
    browserRunnerUrl: config.browserRunnerUrl,
    manifestsDir: config.manifestDir,
    cookies: {
      douyin: accounts.douyin ?? [],
      kuaishou: accounts.kuaishou ?? [],
      wechat_channels: accounts.wechat_channels ?? [],
      xiaohongshu_env_cookie: Boolean(process.env.AI_GROWTH_OPS_XIAOHONGSHU_COOKIE),
      wechat_official_env_cookie: Boolean(process.env.AI_GROWTH_OPS_WECHAT_OFFICIAL_COOKIE),
      zhihu_env_cookie: Boolean(process.env.AI_GROWTH_OPS_ZHIHU_COOKIE),
      baijiahao_env_cookie: Boolean(process.env.AI_GROWTH_OPS_BAIJIAHAO_COOKIE),
    },
    livePublishPlatforms: ['douyin', 'wechat_channels', 'kuaishou'],
    browserRunnerFallbackPlatforms: ['xiaohongshu', 'wechat_official', 'zhihu', 'baijiahao'],
  };
}
