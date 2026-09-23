import { z } from 'zod';
import { PROSPECTING_SUPPORTED_PLATFORMS } from '@ai-growth-ops/shared';

const platformSchema = z.enum(PROSPECTING_SUPPORTED_PLATFORMS);

export const createProspectingTaskSchema = z.object({
  planId: z.string().uuid(),
  enabledStrategyIds: z.array(z.string().min(1)).min(2).max(7),
  minRelevanceScore: z.number().int().min(0).max(100).default(40)
});

export const analyzeProspectingPlanSchema = z.object({
  platform: platformSchema.default('douyin'),
  platformAccountId: z.string().uuid(),
  requirement: z.string().trim().min(20).max(2000)
});

export const runProspectingTaskSchema = z.object({
  forceRecrawl: z.boolean().optional()
});

export const convertProspectSchema = z.object({
  phone: z.string().optional(),
  displayName: z.string().optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  intent: z.string().optional(),
  confirmDuplicate: z.boolean().optional()
});
