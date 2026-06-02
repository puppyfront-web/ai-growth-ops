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
  createDefaultOrganization,
} from './auth.js';
import { validateBody } from './middleware/validate.js';
import {
  registerSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from './schemas/auth.js';
import { getEmailProvider, welcomeEmail, resetPasswordEmail } from '@ai-growth-ops/email';

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

function sendValidationErrors(res: ServerResponse, errors: Array<{ field: string; message: string }>) {
  sendJson(res, 400, { error: '输入验证失败', errors });
}

export const authRoutes: Array<{ method: string; pattern: string; handler: (req: IncomingMessage, res: ServerResponse, ctx: AuthRouteContext) => Promise<void> }> = [
  // POST /api/auth/register
  {
    method: 'POST',
    pattern: '/api/auth/register',
    handler: async (_req, res, ctx) => {
      const result = validateBody(registerSchema, ctx.body);
      if (!result.success) return sendValidationErrors(res, result.errors);

      const { email, password, name } = result.data;

      // Check duplicate
      const existing = await ctx.db.user.findUnique({ where: { email } });
      if (existing) return sendJson(res, 409, { error: '该邮箱已注册' });

      // Create user
      const user = await ctx.db.user.create({
        data: {
          email,
          name,
          passwordHash: hashPassword(password),
          role: 'admin',
        },
      });

      // Create default organization for the new user
      const defaultOrg = await createDefaultOrganization(ctx.db, user.id, user.name);

      // Generate email verification token
      const verifyToken = await createEmailVerificationToken(ctx.db, user.id);
      console.log(`[AUTH] Email verification token for ${email}: ${verifyToken}`);

      // Send welcome + verification email (non-blocking)
      const baseUrl = process.env.APP_URL || 'http://localhost:3000';
      const verifyUrl = `${baseUrl}/verify-email?token=${verifyToken}`;
      const emailProvider = getEmailProvider();
      const emailContent = welcomeEmail({ name: user.name, verifyUrl });
      emailProvider.send({
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      }).catch(err => {
        console.error(`[AUTH] Failed to send welcome email to ${email}:`, err);
      });

      // Auto-login after registration
      const token = createToken(user.id);
      sendJson(res, 201, {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        organizations: [{
          id: defaultOrg.id,
          name: defaultOrg.name,
          slug: defaultOrg.slug,
          role: 'owner',
        }],
      });
    },
  },

  // POST /api/auth/verify-email
  {
    method: 'POST',
    pattern: '/api/auth/verify-email',
    handler: async (_req, res, ctx) => {
      const result = validateBody(verifyEmailSchema, ctx.body);
      if (!result.success) return sendValidationErrors(res, result.errors);

      const userId = await verifyEmailVerificationToken(ctx.db, result.data.token);
      if (!userId) return sendJson(res, 400, { error: '验证令牌无效或已过期' });

      await markEmailVerified(ctx.db, result.data.token);
      sendJson(res, 200, { success: true, message: '邮箱验证成功' });
    },
  },

  // POST /api/auth/forgot-password
  {
    method: 'POST',
    pattern: '/api/auth/forgot-password',
    handler: async (_req, res, ctx) => {
      const result = validateBody(forgotPasswordSchema, ctx.body);
      if (!result.success) return sendValidationErrors(res, result.errors);

      const user = await ctx.db.user.findUnique({ where: { email: result.data.email, deletedAt: null } });
      // Always return success to prevent email enumeration
      if (!user) return sendJson(res, 200, { success: true, message: '如果该邮箱已注册，重置邮件已发送' });

      const resetToken = await createPasswordResetToken(ctx.db, user.id);
      console.log(`[AUTH] Password reset token for ${result.data.email}: ${resetToken}`);

      // Send password reset email (non-blocking)
      const baseUrl = process.env.APP_URL || 'http://localhost:3000';
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
      const emailProvider = getEmailProvider();
      const emailContent = resetPasswordEmail({ name: user.name, resetUrl });
      emailProvider.send({
        to: result.data.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      }).catch(err => {
        console.error(`[AUTH] Failed to send reset email to ${result.data.email}:`, err);
      });

      sendJson(res, 200, { success: true, message: '如果该邮箱已注册，重置邮件已发送' });
    },
  },

  // POST /api/auth/reset-password
  {
    method: 'POST',
    pattern: '/api/auth/reset-password',
    handler: async (_req, res, ctx) => {
      const result = validateBody(resetPasswordSchema, ctx.body);
      if (!result.success) return sendValidationErrors(res, result.errors);

      const userId = await verifyPasswordResetToken(ctx.db, result.data.token);
      if (!userId) return sendJson(res, 400, { error: '重置令牌无效或已过期' });

      await ctx.db.user.update({
        where: { id: userId },
        data: { passwordHash: hashPassword(result.data.password) },
      });
      await markResetTokenUsed(ctx.db, result.data.token);

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

      const result = validateBody(changePasswordSchema, ctx.body);
      if (!result.success) return sendValidationErrors(res, result.errors);

      // Verify old password
      if (!user.passwordHash || !verifyPassword(result.data.oldPassword, user.passwordHash)) {
        return sendJson(res, 400, { error: '当前密码不正确' });
      }

      await ctx.db.user.update({
        where: { id: user.id },
        data: { passwordHash: hashPassword(result.data.newPassword) },
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
      console.log(`[AUTH] Resent verification token for ${user.email}: ${verifyToken}`);

      // Send verification email (non-blocking)
      const baseUrl = process.env.APP_URL || 'http://localhost:3000';
      const verifyUrl = `${baseUrl}/verify-email?token=${verifyToken}`;
      const emailProvider = getEmailProvider();
      const emailContent = welcomeEmail({ name: user.name, verifyUrl });
      emailProvider.send({
        to: user.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      }).catch(err => {
        console.error(`[AUTH] Failed to send verification email to ${user.email}:`, err);
      });

      sendJson(res, 200, { success: true, message: '验证邮件已重新发送' });
    },
  },
];
