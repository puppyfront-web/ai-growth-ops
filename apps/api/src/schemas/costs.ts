import { z } from 'zod';

const channelSchema = z.enum([
  'douyin',
  'xiaohongshu',
  'wechat_official',
  'wechat_channels',
  'baijiahao',
  'zhihu',
  'manual',
  'import',
  'referral',
  'exhibition',
  'phone',
  'website',
  'partner',
  'other'
]);

const dateTimeSchema = z.string().datetime().optional();

export const createMarketingCostSchema = z.object({
  channel: channelSchema.nullable().optional(),
  contentItemId: z.string().min(1).nullable().optional(),
  category: z.enum(['ad', 'content', 'labor', 'tool', 'other']).optional(),
  amount: z.number().min(0, '金额不能为负数').max(999999999999.99),
  currency: z.string().min(1).max(8).optional(),
  incurredAt: dateTimeSchema,
  note: z.string().max(1000).nullable().optional()
});

export const updateMarketingCostSchema = z.object({
  channel: channelSchema.nullable().optional(),
  contentItemId: z.string().min(1).nullable().optional(),
  category: z.enum(['ad', 'content', 'labor', 'tool', 'other']).optional(),
  amount: z.number().min(0).max(999999999999.99).optional(),
  currency: z.string().min(1).max(8).optional(),
  incurredAt: dateTimeSchema,
  note: z.string().max(1000).nullable().optional()
});

export const attributionModelSchema = z.enum([
  'first_touch',
  'last_touch',
  'linear'
]);
