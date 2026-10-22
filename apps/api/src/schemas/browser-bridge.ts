import { z } from 'zod';

export const completeBrowserBridgeSessionSchema = z.object({
  cookies: z.string().min(1).max(32_000)
});

export const failBrowserBridgeSessionSchema = z.object({
  code: z.string().min(1).max(64),
  message: z.string().min(1).max(500)
});
