import { z } from 'zod';

export const llmSettingsSchema = z.object({
  provider: z.enum(['openai', 'anthropic']).optional(),
  apiKey: z.string().trim().max(4096).optional(),
  baseUrl: z.string().trim().max(2048).optional(),
  model: z.string().trim().max(256).optional()
});
