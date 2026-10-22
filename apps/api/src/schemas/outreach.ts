import { z } from 'zod';

export const outreachChannelSchema = z.enum([
  'official_dm',
  'wecom',
  'email',
  'phone_task',
  'manual'
]);

const outreachStepSchema = z.object({
  order: z.number().int().min(1).max(50),
  delayHours: z.number().int().min(0).max(24 * 365),
  template: z.string().min(1).max(4000),
  requireReview: z.boolean().optional()
});

export const createOutreachSequenceSchema = z.object({
  name: z.string().min(1, '序列名称不能为空').max(120),
  description: z.string().max(1000).nullable().optional(),
  channel: outreachChannelSchema,
  enabled: z.boolean().optional(),
  steps: z.array(outreachStepSchema).min(1, '至少需要一个步骤').max(50)
});

export const updateOutreachSequenceSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  channel: outreachChannelSchema.optional(),
  enabled: z.boolean().optional(),
  steps: z.array(outreachStepSchema).min(1).max(50).optional()
});

export const createOutreachEnrollmentSchema = z.object({
  sequenceId: z.string().min(1),
  customerId: z.string().min(1),
  ownerId: z.string().min(1).nullable().optional()
});

export const completeOutreachTouchSchema = z.object({
  status: z.enum(['sent', 'skipped', 'replied']),
  note: z.string().max(2000).nullable().optional(),
  externalId: z.string().max(200).nullable().optional()
});

export const cancelOutreachEnrollmentSchema = z.object({
  reason: z.string().max(500).optional()
});

export const outreachSuppressionSchema = z.object({
  type: z.enum(['customer', 'email', 'phone']),
  value: z.string().min(1).max(200),
  reason: z.string().max(500).nullable().optional()
});

const capabilityStatusSchema = z.enum([
  'verified',
  'beta',
  'unverified',
  'unsupported'
]);

export const outreachChannelConfigSchema = z.object({
  official_dm: capabilityStatusSchema.optional(),
  wecom: capabilityStatusSchema.optional(),
  email: capabilityStatusSchema.optional(),
  phone_task: capabilityStatusSchema.optional(),
  manual: capabilityStatusSchema.optional()
});
