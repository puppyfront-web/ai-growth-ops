import { z } from 'zod';

export const createPublishJobSchema = z.object({
  contentItemId: z.string().min(1, '请选择内容'),
  contentVariantId: z.string().min(1, '请选择变体'),
  platformAccountId: z.string().min(1, '请选择平台账号'),
  scheduledAt: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
});

export const batchPublishSchema = z.object({
  contentItemId: z.string().min(1, '请选择内容'),
  platformAccountIds: z.array(z.string()).min(1, '至少选择一个平台账号'),
});

export const updatePublishJobSchema = z.object({
  scheduledAt: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
  status: z.enum(['DRAFT', 'READY', 'SCHEDULED', 'CANCELLED']).optional(),
});
