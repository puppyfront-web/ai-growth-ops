import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseClient } from '@ai-growth-ops/database';
import {
  addOutreachSuppression,
  cancelOutreachEnrollment,
  completeOutreachTouch,
  createOutreachSequence,
  enrollCustomerInSequence,
  getOutreachSequence,
  getOutreachWorkbench,
  listDueOutreachTouches,
  listOutreachEnrollments,
  listOutreachSequences,
  listOutreachSuppressions,
  pauseOutreachEnrollment,
  removeOutreachSuppression,
  resumeOutreachEnrollment,
  scanOutreach,
  softDeleteOutreachSequence,
  updateOutreachSequence
} from '@ai-growth-ops/database';
import { getOrganizationContext } from './auth.js';
import { validateBody } from './middleware/validate.js';
import { hasPermission } from './middleware/rbac.js';
import {
  cancelOutreachEnrollmentSchema,
  completeOutreachTouchSchema,
  createOutreachEnrollmentSchema,
  createOutreachSequenceSchema,
  outreachChannelConfigSchema,
  outreachSuppressionSchema,
  updateOutreachSequenceSchema
} from './schemas/outreach.js';

interface OutreachRouteContext {
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

function handleError(res: ServerResponse, error: unknown): void {
  sendJson(res, 400, {
    error: error instanceof Error ? error.message : '操作失败'
  });
}

const DEFAULT_CHANNEL_CONFIG = {
  manual: 'verified',
  phone_task: 'verified',
  official_dm: 'unverified',
  wecom: 'unverified',
  email: 'unverified'
} as const;

export const outreachRoutes: Array<{
  method: string;
  pattern: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: OutreachRouteContext
  ) => Promise<void>;
}> = [
  {
    method: 'GET',
    pattern: '/api/outreach/workbench',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;
      const workbench = await getOutreachWorkbench(
        ctx.db,
        orgCtx.organization.id
      );
      sendJson(res, 200, workbench);
    }
  },
  {
    method: 'GET',
    pattern: '/api/outreach/sequences',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;
      const items = await listOutreachSequences(
        ctx.db,
        orgCtx.organization.id
      );
      sendJson(res, 200, { items });
    }
  },
  {
    method: 'POST',
    pattern: '/api/outreach/sequences',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      const body = validateBody(createOutreachSequenceSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      try {
        const sequence = await createOutreachSequence(ctx.db, {
          ...body.data,
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id
        });
        sendJson(res, 201, sequence);
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'GET',
    pattern: '/api/outreach/sequences/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;
      try {
        const sequence = await getOutreachSequence(
          ctx.db,
          ctx.params.id,
          orgCtx.organization.id
        );
        sendJson(res, 200, sequence);
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'PUT',
    pattern: '/api/outreach/sequences/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      const body = validateBody(updateOutreachSequenceSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      try {
        const sequence = await updateOutreachSequence(
          ctx.db,
          ctx.params.id,
          orgCtx.organization.id,
          body.data
        );
        sendJson(res, 200, sequence);
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'DELETE',
    pattern: '/api/outreach/sequences/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      try {
        await softDeleteOutreachSequence(
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
    pattern: '/api/outreach/enrollments',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;
      const items = await listOutreachEnrollments(
        ctx.db,
        orgCtx.organization.id,
        {
          status: ctx.url.searchParams.get('status') ?? undefined,
          customerId: ctx.url.searchParams.get('customerId') ?? undefined,
          ownerId: ctx.url.searchParams.get('ownerId') ?? undefined
        }
      );
      sendJson(res, 200, { items });
    }
  },
  {
    method: 'POST',
    pattern: '/api/outreach/enrollments',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      const body = validateBody(createOutreachEnrollmentSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      try {
        const result = await enrollCustomerInSequence(ctx.db, {
          organizationId: orgCtx.organization.id,
          sequenceId: body.data.sequenceId,
          customerId: body.data.customerId,
          ownerId: body.data.ownerId
        });
        sendJson(res, result.created ? 201 : 200, result);
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'POST',
    pattern: '/api/outreach/enrollments/:id/pause',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      try {
        sendJson(
          res,
          200,
          await pauseOutreachEnrollment(
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
    method: 'POST',
    pattern: '/api/outreach/enrollments/:id/resume',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      try {
        sendJson(
          res,
          200,
          await resumeOutreachEnrollment(
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
    method: 'POST',
    pattern: '/api/outreach/enrollments/:id/cancel',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      const body = validateBody(cancelOutreachEnrollmentSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      try {
        sendJson(
          res,
          200,
          await cancelOutreachEnrollment(
            ctx.db,
            ctx.params.id,
            orgCtx.organization.id,
            body.data.reason
          )
        );
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'GET',
    pattern: '/api/outreach/touches',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;
      const items = await listDueOutreachTouches(
        ctx.db,
        orgCtx.organization.id,
        { ownerId: ctx.url.searchParams.get('ownerId') }
      );
      sendJson(res, 200, { items });
    }
  },
  {
    method: 'POST',
    pattern: '/api/outreach/touches/:id/complete',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      const body = validateBody(completeOutreachTouchSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      try {
        const result = await completeOutreachTouch(
          ctx.db,
          ctx.params.id,
          orgCtx.organization.id,
          body.data
        );
        sendJson(res, 200, result);
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'GET',
    pattern: '/api/outreach/suppressions',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;
      const items = await listOutreachSuppressions(
        ctx.db,
        orgCtx.organization.id
      );
      sendJson(res, 200, { items });
    }
  },
  {
    method: 'POST',
    pattern: '/api/outreach/suppressions',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      const body = validateBody(outreachSuppressionSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      try {
        const item = await addOutreachSuppression(ctx.db, {
          ...body.data,
          organizationId: orgCtx.organization.id,
          createdBy: orgCtx.user.name
        });
        sendJson(res, 201, item);
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'DELETE',
    pattern: '/api/outreach/suppressions/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      try {
        sendJson(
          res,
          200,
          await removeOutreachSuppression(
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
    method: 'GET',
    pattern: '/api/outreach/channels',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;
      const saved = await ctx.db.appConfig.findFirst({
        where: {
          organizationId: orgCtx.organization.id,
          key: 'outreach_channel_config'
        }
      });
      sendJson(res, 200, saved?.value ?? DEFAULT_CHANNEL_CONFIG);
    }
  },
  {
    method: 'PUT',
    pattern: '/api/outreach/channels',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'settings:manage')) return;
      const body = validateBody(outreachChannelConfigSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      await ctx.db.appConfig.upsert({
        where: {
          userId_key: { userId: orgCtx.user.id, key: 'outreach_channel_config' }
        },
        create: {
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id,
          key: 'outreach_channel_config',
          value: body.data as never
        },
        update: { value: body.data as never }
      });
      sendJson(res, 200, { ok: true });
    }
  },
  {
    method: 'POST',
    pattern: '/api/outreach/scan',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'settings:manage')) return;
      const result = await scanOutreach(
        ctx.db,
        orgCtx.organization.id
      );
      sendJson(res, 200, result);
    }
  }
];
