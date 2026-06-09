import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(1, '请输入密码')
});

export const registerSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(8, '密码至少需要 8 个字符'),
  name: z.string().min(1, '请输入用户名').max(50, '用户名不能超过50个字符')
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z.string().min(8, '新密码至少需要 8 个字符')
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, '缺少重置令牌'),
  password: z.string().min(8, '密码至少需要 8 个字符')
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址')
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, '缺少验证令牌')
});
