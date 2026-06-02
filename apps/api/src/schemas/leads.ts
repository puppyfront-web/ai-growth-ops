import { z } from 'zod';

export const createLeadSchema = z.object({
  sourcePlatform: z.enum(['douyin', 'xiaohongshu', 'wechat_official', 'wechat_channels', 'baijiahao', 'zhihu']),
  sourceAccountId: z.string().min(1),
  externalUserId: z.string().min(1),
  externalUserName: z.string().optional(),
  level: z.enum(['A', 'B', 'C', 'D']).default('C'),
  intent: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const updateLeadSchema = z.object({
  level: z.enum(['A', 'B', 'C', 'D']).optional(),
  status: z.enum(['NEW', 'QUALIFIED', 'SYNCING', 'SYNCED', 'ASSIGNED', 'CONTACTED', 'ADDED_WECOM', 'WON', 'LOST', 'INVALID']).optional(),
  intent: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  assignedTo: z.string().optional(),
  nextAction: z.string().optional(),
  riskLevel: z.string().optional(),
});

export const batchUpdateLeadsSchema = z.object({
  leadIds: z.array(z.string()).min(1, '请选择至少一条线索'),
  status: z.enum(['NEW', 'QUALIFIED', 'SYNCING', 'SYNCED', 'ASSIGNED', 'CONTACTED', 'ADDED_WECOM', 'WON', 'LOST', 'INVALID']).optional(),
  assignedTo: z.string().optional(),
});
