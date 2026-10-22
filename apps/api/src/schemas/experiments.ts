import { z } from 'zod';

const variantSchema = z.object({
  key: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  weight: z.number().positive().max(1000)
});

export const createExperimentSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).nullable().optional(),
  metric: z.string().min(1).max(40).optional(),
  variants: z.array(variantSchema).min(2).max(10)
});

export const assignExperimentSchema = z.object({
  entityType: z.string().min(1).max(40),
  entityId: z.string().min(1).max(200)
});

export const experimentEventSchema = z.object({
  assignmentId: z.string().min(1),
  metric: z.string().min(1).max(40).optional(),
  value: z.number().positive().optional()
});
