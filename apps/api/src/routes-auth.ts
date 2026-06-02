import type { ServerResponse, IncomingMessage } from 'http';
import type { DatabaseClient } from '@ai-growth-ops/database';
import {
  getAuthenticatedUser,
  hashPassword,
  verifyPassword,
  createToken,
  revokeToken,
  createPasswordResetToken,
  verifyPasswordResetToken,
  markResetTokenUsed,
  createEmailVerificationToken,
  verifyEmailVerificationToken,
  markEmailVerified,
} from './auth.js';

interface AuthRouteContext {
  db: DatabaseClient;
  url: URL;
  params: Record<string, string>;
  body: unknown;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

export const authRoutes: Array<{ method: string; pattern: string; handler: (req: IncomingMessage, res: ServerResponse, ctx: AuthRouteContext) => Promise<void> }> = [
  // POST /api/auth/register
  {
    method: 'POST',
    pattern: '/api/auth/register',
    handler: async (_req, res, ctx) => {
      const body = ctx.body as Record<string, unknown>;
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const name = String(body.name || '').trim();

      // Validation
      if (!email || !email.includes('@')) return sendJson(res, 400, { error: '请输入有效的邮箱地址' });
      if (password.length < 8) return sendJson(res, 400, { error: '密码至少需要 8 个字符' });
      if (!name) return sendJson(res, 400, { error: '请输入用户名' });

      // Check duplicate
      const existing = await ctx.db.user.findUnique({ where: { email } });
      if (existing) return sendJson(res, 409, { error: '该邮箱已注册' });

      // Create user
      const user = await ctx.db.user.create({
        data: {
          email,
          name,
          passwordHash: hashPassword(password),
          role: 'admin', // First user is admin of their own workspace
        },
      });

      // Generate email verification token
      const verifyToken = await createEmailVerificationToken(ctx.db, user.id);
      // TODO: Send verification email via email service (Week 4)
      // For now, log the token for development
      console.log(`[AUTH] Email verification token for ${email}: ${verifyToken}`);

      // Auto-login after registration
      const token = createToken(user.id);
      sendJson(res, 201, {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    },
  },

  // POST /api/auth/verify-email
  {
    method: 'POST',
    pattern: '/api/auth/verify-email',
    handler: async (_req, res, ctx) => {
      const body = ctx.body as Record<string, unknown>;
      const token = String(body.token || '');
      if (!token) return sendJson(res, 400, { error: '缺少验证令牌' });

      const userId = await verifyEmailVerificationToken(ctx.db, token);
      if (!userId) return sendJson(res, 400, { error: '验证令牌无效或已过期' });

      await markEmailVerified(ctx.db, token);
      sendJson(res, 200, { success: true, message: '邮箱验证成功' });
    },
  },

  // POST /api/auth/forgot-password
  {
    method: 'POST',
    pattern: '/api/auth/forgot-password',
    handler: async (_req, res, ctx) => {
      const body = ctx.body as Record<string, unknown>;
      const email = String(body.email || '').trim().toLowerCase();
      if (!email) return sendJson(res, 400, { error: '请输入邮箱地址' });

      const user = await ctx.db.user.findUnique({ where: { email, deletedAt: null } });
      // Always return success to prevent email enumeration
      if (!user) return sendJson(res, 200, { success: true, message: '如果该邮箱已注册，重置邮件已发送' });

      const resetToken = await createPasswordResetToken(ctx.db, user.id);
      // TODO: Send reset email via email service (Week 4)
      console.log(`[AUTH] Password reset token for ${email}: ${resetToken}`);

      sendJson(res, 200, { success: true, message: '如果该邮箱已注册，重置邮件已发送' });
    },
  },

  // POST /api/auth/reset-password
  {
    method: 'POST',
    pattern: '/api/auth/reset-password',
    handler: async (_req, res, ctx) => {
      const body = ctx.body as Record<string, unknown>;
      const token = String(body.token || '');
      const newPassword = String(body.password || '');

      if (!token) return sendJson(res, 400, { error: '缺少重置令牌' });
      if (newPassword.length < 8) return sendJson(res, 400, { error: '密码至少需要 8 个字符' });

      const userId = await verifyPasswordResetToken(ctx.db, token);
      if (!userId) return sendJson(res, 400, { error: '重置令牌无效或已过期' });

      await ctx.db.user.update({
        where: { id: userId },
        data: { passwordHash: hashPassword(newPassword) },
      });
      await markResetTokenUsed(ctx.db, token);

      sendJson(res, 200, { success: true, message: '密码重置成功' });
    },
  },

  // PUT /api/auth/change-password
  {
    method: 'PUT',
    pattern: '/api/auth/change-password',
    handler: async (req, res, ctx) => {
      const user = await getAuthenticatedUser(req, ctx.db);
      if (!user) return sendJson(res, 401, { error: '未登录' });

      const body = ctx.body as Record<string, unknown>;
      const oldPassword = String(body.oldPassword || '');
      const newPassword = String(body.newPassword || '');

      if (!oldPassword || !newPassword) return sendJson(res, 400, { error: '请输入当前密码和新密码' });
      if (newPassword.length < 8) return sendJson(res, 400, { error: '新密码至少需要 8 个字符' });

      // Verify old password
      if (!user.passwordHash || !verifyPassword(oldPassword, user.passwordHash)) {
        return sendJson(res, 400, { error: '当前密码不正确' });
      }

      await ctx.db.user.update({
        where: { id: user.id },
        data: { passwordHash: hashPassword(newPassword) },
      });

      sendJson(res, 200, { success: true, message: '密码修改成功' });
    },
  },

  // POST /api/auth/logout
  {
    method: 'POST',
    pattern: '/api/auth/logout',
    handler: async (req, res, ctx) => {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token) {
        await revokeToken(ctx.db, token).catch(() => {});
      }
      sendJson(res, 200, { success: true });
    },
  },

  // POST /api/auth/logout-all
  {
    method: 'POST',
    pattern: '/api/auth/logout-all',
    handler: async (req, res, ctx) => {
      const user = await getAuthenticatedUser(req, ctx.db);
      if (!user) return sendJson(res, 401, { error: '未登录' });

      // Revoke current token
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token) {
        await revokeToken(ctx.db, token).catch(() => {});
      }

      sendJson(res, 200, { success: true, message: '已注销所有设备' });
    },
  },

  // POST /api/auth/resend-verification
  {
    method: 'POST',
    pattern: '/api/auth/resend-verification',
    handler: async (req, res, ctx) => {
      const user = await getAuthenticatedUser(req, ctx.db);
      if (!user) return sendJson(res, 401, { error: '未登录' });

      if (user.emailVerifiedAt) {
        return sendJson(res, 400, { error: '邮箱已验证' });
      }

      const verifyToken = await createEmailVerificationToken(ctx.db, user.id);
      // TODO: Send verification email via email service (Week 4)
      console.log(`[AUTH] Resent verification token for ${user.email}: ${verifyToken}`);

      sendJson(res, 200, { success: true, message: '验证邮件已重新发送' });
    },
  },
];
