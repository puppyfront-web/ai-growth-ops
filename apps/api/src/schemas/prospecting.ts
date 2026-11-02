import { z } from 'zod';
import { PROSPECTING_ALL_PLATFORMS, PROSPECT_PERSONA_TAGS } from '@ai-growth-ops/shared';

const platformSchema = z.enum(PROSPECTING_ALL_PLATFORMS);

export const createProspectingTaskSchema = z.object({
  planId: z.string().uuid(),
  enabledStrategyIds: z.array(z.string().min(1)).min(2).max(7),
  minRelevanceScore: z.number().int().min(0).max(100).default(40),
  // 指定后每个账号各创建一个任务；不指定则沿用计划草稿绑定的账号
  platformAccountIds: z.array(z.string().uuid()).min(1).max(10).optional()
});

export const analyzeProspectingPlanSchema = z.object({
  platform: platformSchema.default('douyin'),
  platformAccountId: z.union([z.string().uuid(), z.literal('auto')]),
  requirement: z.string().trim().min(20).max(2000),
  confirmBeta: z.boolean().optional()
});

export const runProspectingTaskSchema = z.object({
  forceRecrawl: z.boolean().optional()
});

export const scheduleProspectingTaskSchema = z.object({
  enabled: z.boolean(),
  intervalHours: z.number().int().min(1).max(168).optional()
});

export const convertProspectSchema = z.object({
  phone: z.string().optional(),
  displayName: z.string().optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  intent: z.string().optional(),
  confirmDuplicate: z.boolean().optional()
});

export const prospectCandidateQuerySchema = z.object({
  minScore: z.coerce.number().int().min(0).max(100).default(0),
  leadLevel: z.enum(['A', 'B', 'C', 'D']).optional(),
  // 评论者画像（39 号 spec）：语义评估两步判定的产物，用于隔离同行/已落地
  personaTag: z.enum(PROSPECT_PERSONA_TAGS).optional(),
  converted: z.enum(['yes', 'no']).optional(),
  q: z.string().trim().max(100).optional(),
  focusId: z.string().min(1).max(64).optional(),
  sort: z.enum(['relevance', 'latest']).default('latest'),
  // 日期分段：按 createdAt 过滤；单机部署下服务器本地时区即用户时区
  dateRange: z.enum(['all', 'today', '7d', '30d']).default('all')
});
