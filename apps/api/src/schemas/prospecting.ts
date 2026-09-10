import { z } from 'zod';
import { PROSPECTING_SUPPORTED_PLATFORMS } from '@ai-growth-ops/shared';

const platformSchema = z.enum(PROSPECTING_SUPPORTED_PLATFORMS);

export const createProspectingTaskSchema = z.object({
  platform: platformSchema.default('douyin'),
  keywords: z
    .array(z.string().min(1))
    .min(1, '至少一个关键词')
    .max(8, '单次最多 8 个关键词，大批量请分天增量执行'),
  topNVideos: z.number().int().min(1).max(10).default(5),
  maxCommentsPerVideo: z.number().int().min(5).max(50).default(30),
  commentScrollRounds: z.number().int().min(1).max(20).default(8),
  minRelevanceScore: z.number().int().min(0).max(100).default(40)
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
