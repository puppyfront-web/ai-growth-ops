export const packageMetadata = {
  name: '@ai-growth-ops/database',
  scope: 'data'
} as const;

export * from './client';
export * from './repositories';
export * from './schema-metadata';
export * from './seed';
export * from './customer-profile';
export * from './customer-playbook';
export * from './llm-config';
export * from './prospecting';
export * from './customer-crm';
export * from './customer-feishu-sync';
export * from './prospect-guard';
export * from './schema-guard';

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
