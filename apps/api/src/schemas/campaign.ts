import { z } from 'zod';

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  platforms: z.array(z.string()).min(1),
  contentType: z.enum(['text_image', 'video', 'article']).default('text_image'),
  scheduleConfig: z
    .object({
      frequency: z.string().optional(),
      days: z.array(z.string()).optional(),
      time: z.string().optional(),
      timezone: z.string().default('Asia/Shanghai')
    })
    .optional(),
  topicConfig: z
    .object({
      topic: z.string(),
      keywords: z.array(z.string()).optional(),
      brandTone: z.string().optional(),
      imageStyle: z.string().optional(),
      useFeedbackInsights: z.boolean().default(false)
    })
    .optional(),
  autoPublish: z.boolean().default(true),
  autoCompliance: z.boolean().default(true),
  maxPostsTotal: z.number().int().min(1).optional()
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  platforms: z.array(z.string()).min(1).optional(),
  contentType: z.enum(['text_image', 'video', 'article']).optional(),
  scheduleConfig: z
    .object({
      frequency: z.string().optional(),
      days: z.array(z.string()).optional(),
      time: z.string().optional(),
      timezone: z.string().default('Asia/Shanghai')
    })
    .optional(),
  topicConfig: z
    .object({
      topic: z.string(),
      keywords: z.array(z.string()).optional(),
      brandTone: z.string().optional(),
      imageStyle: z.string().optional(),
      useFeedbackInsights: z.boolean().default(false)
    })
    .optional(),
  autoPublish: z.boolean().optional(),
  autoCompliance: z.boolean().optional(),
  maxPostsTotal: z.number().int().min(1).optional(),
  status: z.enum(['draft', 'paused', 'archived']).optional()
});
