import { z } from 'zod';

const captureFieldSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/),
  label: z.string().min(1).max(60),
  type: z.enum(['text', 'tel', 'email', 'textarea']),
  required: z.boolean().optional()
});

const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug 只能包含小写字母、数字和连字符');

export const createLeadCaptureFormSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema,
  title: z.string().min(1).max(160),
  description: z.string().max(1000).nullable().optional(),
  fields: z.array(captureFieldSchema).min(1).max(20),
  enabled: z.boolean().optional(),
  submitMessage: z.string().max(300).nullable().optional()
});

export const updateLeadCaptureFormSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(1000).nullable().optional(),
  fields: z.array(captureFieldSchema).min(1).max(20).optional(),
  enabled: z.boolean().optional(),
  submitMessage: z.string().max(300).nullable().optional()
});

export const submitLeadCaptureFormSchema = z.object({
  name: z.string().min(1, '请填写姓名').max(120),
  phone: z.string().min(1, '请填写手机号').max(40),
  email: z.string().email().max(200).nullable().optional(),
  company: z.string().max(200).nullable().optional(),
  message: z.string().max(2000).nullable().optional(),
  source: z.string().max(200).nullable().optional()
});

const assignmentConditionsSchema = z.object({
  channel: z.string().max(50).optional(),
  level: z.string().max(10).optional(),
  industry: z.string().max(100).optional(),
  region: z.string().max(100).optional()
});

export const createAssignmentRuleSchema = z.object({
  name: z.string().min(1).max(120),
  priority: z.number().int().min(1).max(10000).optional(),
  conditions: assignmentConditionsSchema,
  assigneeId: z.string().min(1).nullable().optional(),
  strategy: z.enum(['fixed', 'least_loaded']).optional(),
  enabled: z.boolean().optional()
});

export const updateAssignmentRuleSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  priority: z.number().int().min(1).max(10000).optional(),
  conditions: assignmentConditionsSchema.optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  strategy: z.enum(['fixed', 'least_loaded']).optional(),
  enabled: z.boolean().optional()
});
