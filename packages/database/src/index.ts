export const packageMetadata = {
  name: '@ai-growth-ops/database',
  scope: 'data'
} as const;

export * from './client';
export * from './repositories';
export * from './schema-metadata';
export * from './seed';

export type {
  ContentItem,
  ContentOpportunity,
  ContentVariant,
  Interaction,
  Lead,
  Platform,
  PlatformAccount,
  ProviderRunLog,
  PublishJob,
  ResearchInsight,
  ResearchTask,
  SkillRun,
  User
} from '@prisma/client';
