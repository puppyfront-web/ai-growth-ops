import { z } from 'zod';

export const upsertConfigSchema = z.object({
  key: z.string().min(1, '配置键不能为空'),
  value: z.any()
});

export const createPlatformAccountSchema = z.object({
  platform: z.enum([
    'douyin',
    'xiaohongshu',
    'wechat_official',
    'wechat_channels',
    'baijiahao',
    'zhihu'
  ]),
  name: z.string().min(1, '请输入账号名称'),
  mode: z
    .enum(['official_api', 'browser_assist', 'manual_confirm', 'manual_import'])
    .default('official_api'),
  authType: z.string().optional(),
  accessTokenEncrypted: z.string().optional(),
  refreshTokenEncrypted: z.string().optional(),
  capabilities: z.record(z.unknown()).optional()
});

export const updatePlatformAccountSchema = z.object({
  name: z.string().optional(),
  mode: z
    .enum(['official_api', 'browser_assist', 'manual_confirm', 'manual_import'])
    .optional(),
  capabilities: z.record(z.unknown()).optional()
});

export const createTeamInviteSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  role: z.enum(['admin', 'member', 'viewer']).default('member')
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member', 'viewer'])
});

export const createOrgSchema = z.object({
  name: z
    .string()
    .min(1, '请输入组织名称')
    .max(100, '组织名称不能超过100个字符')
});

export const updateOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional()
});
