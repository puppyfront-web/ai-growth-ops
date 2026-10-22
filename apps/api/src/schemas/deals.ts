import { z } from 'zod';

export const dealStageSchema = z.enum([
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost'
]);

const acquisitionChannelSchema = z.enum([
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

const amountSchema = z
  .number()
  .min(0, '金额不能为负数')
  .max(999999999999.99, '金额超出上限')
  .refine(
    (value) => Math.round(value * 100) === value * 100,
    '金额最多保留两位小数'
  );

const dateTimeSchema = z.string().datetime().nullable().optional();

export const createDealSchema = z.object({
  customerId: z.string().min(1, '请选择客户'),
  leadId: z.string().min(1).nullable().optional(),
  title: z.string().min(1, '商机名称不能为空').max(200),
  stage: dealStageSchema.default('new'),
  amount: amountSchema.nullable().optional(),
  currency: z.string().min(1).max(8).default('CNY'),
  expectedCloseDate: dateTimeSchema,
  ownerId: z.string().min(1).nullable().optional(),
  nextAction: z.string().max(500).nullable().optional(),
  nextActionAt: dateTimeSchema,
  sourceChannel: acquisitionChannelSchema.nullable().optional(),
  sourceContentItemId: z.string().min(1).nullable().optional(),
  sourcePublishJobId: z.string().min(1).nullable().optional(),
  lostReason: z.string().max(500).nullable().optional()
});

export const updateDealSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  stage: dealStageSchema.optional(),
  amount: amountSchema.nullable().optional(),
  currency: z.string().min(1).max(8).optional(),
  expectedCloseDate: dateTimeSchema,
  ownerId: z.string().min(1).nullable().optional(),
  nextAction: z.string().max(500).nullable().optional(),
  nextActionAt: dateTimeSchema,
  sourceChannel: acquisitionChannelSchema.nullable().optional(),
  sourceContentItemId: z.string().min(1).nullable().optional(),
  sourcePublishJobId: z.string().min(1).nullable().optional(),
  lostReason: z.string().max(500).nullable().optional(),
  reopenReason: z.string().max(500).nullable().optional()
});

export const addDealActivitySchema = z.object({
  action: z.string().min(1).max(100),
  note: z.string().max(2000).nullable().optional(),
  nextAction: z.string().max(500).nullable().optional(),
  nextActionAt: dateTimeSchema
});
