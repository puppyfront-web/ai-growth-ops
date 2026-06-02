import { z } from 'zod';

export const createResearchTaskSchema = z.object({
  type: z.string().min(1, '请选择调研类型'),
  platforms: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  targetAccountConfigs: z.array(z.object({
    platform: z.string(),
    accountId: z.string(),
    accountName: z.string().optional(),
  })).optional(),
});

export const updateResearchTaskSchema = z.object({
  type: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
});
