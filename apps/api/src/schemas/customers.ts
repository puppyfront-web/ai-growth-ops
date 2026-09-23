import { z } from 'zod';
import {
  CUSTOMER_IMPORT_CSV_MAX_CHARS,
  isValidPhone
} from '@ai-growth-ops/shared';

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

const phoneSchema = z
  .string()
  .min(1, '手机号不能为空')
  .refine(isValidPhone, '请输入有效的手机号');

export const createCustomerSchema = z.object({
  displayName: z.string().min(1, '姓名不能为空'),
  phone: phoneSchema,
  company: z.string().min(1, '公司不能为空'),
  role: z.string().min(1, '职位不能为空'),
  intent: z.string().min(1, '需求不能为空'),
  channel: acquisitionChannelSchema.default('manual'),
  sourceNote: z.string().optional(),
  assignedTo: z.string().optional(),
  tags: z.array(z.string()).optional(),
  confirmDuplicate: z.boolean().optional()
});

export const updateCustomerSchema = z.object({
  displayName: z.string().min(1).optional(),
  phone: z
    .string()
    .refine(
      (value) => value.trim() === '' || isValidPhone(value),
      '请输入有效的手机号'
    )
    .optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  intent: z.string().min(1).optional(),
  channel: acquisitionChannelSchema.optional(),
  sourceNote: z.string().optional(),
  status: z.enum(['active', 'inactive', 'won', 'lost']).optional(),
  assignedTo: z.string().optional(),
  tags: z.array(z.string()).optional()
});

export const addCustomerActivitySchema = z.object({
  action: z.string().min(1),
  note: z.string().optional()
});

const customerFieldMappingSchema = z
  .object({
    displayName: z.number().int().min(0).optional(),
    phone: z.number().int().min(0).optional(),
    company: z.number().int().min(0).optional(),
    role: z.number().int().min(0).optional(),
    intent: z.number().int().min(0).optional(),
    channel: z.number().int().min(0).optional(),
    sourceNote: z.number().int().min(0).optional()
  })
  .optional();

const csvBodySchema = z
  .string()
  .min(1, 'CSV 内容不能为空')
  .max(CUSTOMER_IMPORT_CSV_MAX_CHARS, 'CSV 不能超过 500KB');

export const customerImportPreviewSchema = z.object({
  csv: csvBodySchema,
  mapping: customerFieldMappingSchema
});

export const customerImportExecuteSchema = z.object({
  csv: csvBodySchema,
  mapping: customerFieldMappingSchema,
  skipDuplicates: z.boolean().default(true)
});

export const icpConfigSchema = z.object({
  targetIndustries: z.array(z.string()),
  targetRoles: z.array(z.string()),
  highIntentKeywords: z.array(z.string()),
  excludedKeywords: z.array(z.string())
});

const playbookActionSchema = z.object({
  id: z.string(),
  type: z.enum([
    'call',
    'wecom_message',
    'email',
    'meeting',
    'send_material',
    'follow_up_note'
  ]),
  title: z.string(),
  content: z.string(),
  dueAt: z.string().nullable(),
  status: z.enum(['pending', 'done', 'skipped']),
  priority: z.enum(['high', 'medium', 'low'])
});

export const updateCustomerPlaybookSchema = z.object({
  status: z.enum(['completed', 'cancelled']).optional(),
  actions: z.array(playbookActionSchema).optional()
});
