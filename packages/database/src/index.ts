import type { Prisma } from '@prisma/client';

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
export * from './llm-telemetry';
export * from './prospecting';
export * from './prospecting-plan';
export * from './prospecting-schedule';
export * from './customer-crm';
export * from './lifecycle';
export * from './deals';
export * from './outreach';
export * from './assignment';
export * from './lead-capture';
export * from './inquiry-ingest';
export * from './customer-merge';
export * from './costs';
export * from './experiments';
export * from './backfill-deals';
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

// Prisma 生成的 WhereInput 类型挂在 `Prisma` 命名空间下，这里拍平再导出。
export type ProspectCandidateWhereInput =
  Prisma.ProspectCandidateWhereInput;
