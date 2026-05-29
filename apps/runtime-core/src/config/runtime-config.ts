import { existsSync } from 'node:fs';

export interface RuntimeConfig {
  environment: string;
  dataDir: string;
  manifestDir: string;
  socialPublishSkillsRoot?: string;
  browserRunnerUrl: string;
  sharedAccounts: {
    douyin: string;
    kuaishou: string;
    wechat_channels: string;
    xiaohongshu: string;
    wechat_official: string;
    zhihu: string;
    baijiahao: string;
  };
}

export function loadRuntimeConfig(): RuntimeConfig {
  const localSocialPublishRoot = '/Users/tutu/.agents/skills/social-publish-skills';
  const socialPublishSkillsRoot =
    process.env.AI_GROWTH_OPS_SOCIAL_PUBLISH_ROOT ??
    (existsSync(localSocialPublishRoot) ? localSocialPublishRoot : undefined);

  return {
    environment: process.env.NODE_ENV ?? 'development',
    dataDir: process.env.AI_GROWTH_OPS_DATA_DIR ?? 'data',
    manifestDir: process.env.AI_GROWTH_OPS_MANIFEST_DIR ?? 'skills/manifests',
    socialPublishSkillsRoot,
    browserRunnerUrl: process.env.BROWSER_RUNNER_URL ?? 'http://localhost:3200',
    sharedAccounts: {
      douyin: process.env.AI_GROWTH_OPS_DOUYIN_SHARED_ACCOUNT ?? 'shared',
      kuaishou: process.env.AI_GROWTH_OPS_KUAISHOU_SHARED_ACCOUNT ?? 'shared',
      wechat_channels: process.env.AI_GROWTH_OPS_WECHAT_CHANNELS_SHARED_ACCOUNT ?? 'shared',
      xiaohongshu: process.env.AI_GROWTH_OPS_XIAOHONGSHU_SHARED_ACCOUNT ?? 'shared',
      wechat_official: process.env.AI_GROWTH_OPS_WECHAT_OFFICIAL_SHARED_ACCOUNT ?? 'shared',
      zhihu: process.env.AI_GROWTH_OPS_ZHIHU_SHARED_ACCOUNT ?? 'shared',
      baijiahao: process.env.AI_GROWTH_OPS_BAIJIAHAO_SHARED_ACCOUNT ?? 'shared',
    },
  };
}
