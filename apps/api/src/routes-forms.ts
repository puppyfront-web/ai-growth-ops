import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseClient } from '@ai-growth-ops/database';
import {
  createAssignmentRule,
  createLeadCaptureForm,
  deleteAssignmentRule,
  getLeadCaptureForm,
  getPublicLeadCaptureForm,
  listAssignmentRules,
  listLeadCaptureForms,
  listLeadCaptureSubmissions,
  softDeleteLeadCaptureForm,
  submitLeadCaptureForm,
  updateAssignmentRule,
  updateLeadCaptureForm
} from '@ai-growth-ops/database';
import { getOrganizationContext } from './auth.js';
import { validateBody } from './middleware/validate.js';
import { hasPermission } from './middleware/rbac.js';
import { isRateLimited } from './server.js';
import {
  createAssignmentRuleSchema,
  createLeadCaptureFormSchema,
  submitLeadCaptureFormSchema,
  updateAssignmentRuleSchema,
  updateLeadCaptureFormSchema
} from './schemas/forms.js';

interface FormRouteContext {
  db: DatabaseClient;
  url: URL;
  params: Record<string, string>;
  body: unknown;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function canAccess(
  res: ServerResponse,
  role: string,
  permission: 'lead:view' | 'lead:edit' | 'settings:manage'
): boolean {
  if (hasPermission(role, permission)) return true;
  sendJson(res, 403, { error: '权限不足' });
  return false;
}

function handleError(res: ServerResponse, error: unknown) {
  sendJson(res, 400, {
    error: error instanceof Error ? error.message : '操作失败'
  });
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]!.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export const formRoutes: Array<{
  method: string;
  pattern: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: FormRouteContext
  ) => Promise<void>;
}> = [
  // ── Public form endpoints (no auth) ─────────────────────────────
  {
    method: 'GET',
    pattern: '/api/public/forms/:slug',
    handler: async (req, res, ctx) => {
      if (isRateLimited(`form:get:${clientIp(req)}`, 60, 60_000)) {
        return sendJson(res, 429, { error: '请求过于频繁' });
      }
      try {
        const form = await getPublicLeadCaptureForm(ctx.db, ctx.params.slug);
        sendJson(res, 200, form);
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'POST',
    pattern: '/api/public/forms/:slug/submit',
    handler: async (req, res, ctx) => {
      if (isRateLimited(`form:submit:${clientIp(req)}`, 10, 60_000)) {
        return sendJson(res, 429, { error: '提交过于频繁，请稍后再试' });
      }
      const body = validateBody(submitLeadCaptureFormSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      try {
        const result = await submitLeadCaptureForm(ctx.db, {
          ...body.data,
          slug: ctx.params.slug,
          userAgent: req.headers['user-agent']
        });
        sendJson(res, 201, {
          ok: true,
          message: result.submitMessage,
          submissionId: result.submission.id
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  },

  // ── Authenticated form management ───────────────────────────────
  {
    method: 'GET',
    pattern: '/api/forms',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;
      const items = await listLeadCaptureForms(
        ctx.db,
        orgCtx.organization.id
      );
      sendJson(res, 200, { items });
    }
  },
  {
    method: 'POST',
    pattern: '/api/forms',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      const body = validateBody(createLeadCaptureFormSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      try {
        const form = await createLeadCaptureForm(ctx.db, {
          ...body.data,
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id
        });
        sendJson(res, 201, form);
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'GET',
    pattern: '/api/forms/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;
      try {
        sendJson(
          res,
          200,
          await getLeadCaptureForm(
            ctx.db,
            ctx.params.id,
            orgCtx.organization.id
          )
        );
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'PUT',
    pattern: '/api/forms/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      const body = validateBody(updateLeadCaptureFormSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      try {
        sendJson(
          res,
          200,
          await updateLeadCaptureForm(
            ctx.db,
            ctx.params.id,
            orgCtx.organization.id,
            body.data
          )
        );
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'DELETE',
    pattern: '/api/forms/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      try {
        await softDeleteLeadCaptureForm(
          ctx.db,
          ctx.params.id,
          orgCtx.organization.id
        );
        sendJson(res, 200, { id: ctx.params.id, deleted: true });
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'GET',
    pattern: '/api/forms/:id/submissions',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;
      const items = await listLeadCaptureSubmissions(
        ctx.db,
        orgCtx.organization.id,
        ctx.params.id
      );
      sendJson(res, 200, { items });
    }
  },

  // ── Assignment rules ────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/settings/assignment-rules',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;
      const items = await listAssignmentRules(
        ctx.db,
        orgCtx.organization.id
      );
      sendJson(res, 200, { items });
    }
  },
  {
    method: 'POST',
    pattern: '/api/settings/assignment-rules',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'settings:manage')) return;
      const body = validateBody(createAssignmentRuleSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      try {
        const rule = await createAssignmentRule(ctx.db, {
          ...body.data,
          organizationId: orgCtx.organization.id
        });
        sendJson(res, 201, rule);
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'PUT',
    pattern: '/api/settings/assignment-rules/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'settings:manage')) return;
      const body = validateBody(updateAssignmentRuleSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      try {
        sendJson(
          res,
          200,
          await updateAssignmentRule(
            ctx.db,
            ctx.params.id,
            orgCtx.organization.id,
            body.data
          )
        );
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'DELETE',
    pattern: '/api/settings/assignment-rules/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'settings:manage')) return;
      try {
        sendJson(
          res,
          200,
          await deleteAssignmentRule(
            ctx.db,
            ctx.params.id,
            orgCtx.organization.id
          )
        );
      } catch (error) {
        handleError(res, error);
      }
    }
  }
];
