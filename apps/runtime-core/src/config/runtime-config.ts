import { existsSync } from 'node:fs';

export interface RuntimeConfig {
  environment: string;
  dataDir: string;
  manifestDir: string;
  socialPublishSkillsRoot?: string;
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
  };
}
