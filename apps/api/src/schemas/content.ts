import { z } from 'zod';

export const createContentItemSchema = z.object({
  projectId: z.string().optional(),
  type: z
    .enum(['text_image', 'video', 'article', 'answer'])
    .default('text_image'),
  title: z.string().min(1, '标题不能为空').max(200, '标题不能超过200个字符'),
  body: z.string().optional().default(''),
  sourceType: z.string().optional(),
  sourceResearchTaskId: z.string().optional()
});

export const updateContentItemSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(200).optional(),
  body: z.string().optional(),
  status: z.enum(['draft', 'ready', 'archived']).optional()
});

export const createContentVariantSchema = z.object({
  platform: z.enum([
    'douyin',
    'xiaohongshu',
    'wechat_official',
    'wechat_channels',
    'baijiahao',
    'zhihu'
  ]),
  contentType: z.enum(['text_image', 'video', 'article', 'answer']),
  title: z.string().optional(),
  body: z.string().optional(),
  tags: z.array(z.string()).optional(),
  cta: z.string().optional()
});

export const updateContentVariantSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  tags: z.array(z.string()).optional(),
  cta: z.string().optional(),
  complianceStatus: z.enum(['pending', 'approved', 'rejected']).optional()
});

export const batchGenerateVariantsSchema = z.object({
  platforms: z
    .array(
      z.enum([
        'douyin',
        'xiaohongshu',
        'wechat_official',
        'wechat_channels',
        'baijiahao',
        'zhihu'
      ])
    )
    .min(1, '至少选择一个平台')
});
