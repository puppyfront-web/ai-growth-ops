import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseClient } from '@ai-growth-ops/database';
import {
  assignExperimentVariant,
  createExperiment,
  getExperiment,
  getExperimentResults,
  listExperiments,
  recordExperimentEvent,
  startExperiment,
  stopExperiment
} from '@ai-growth-ops/database';
import { getOrganizationContext } from './auth.js';
import { hasPermission } from './middleware/rbac.js';
import { validateBody } from './middleware/validate.js';
import {
  assignExperimentSchema,
  createExperimentSchema,
  experimentEventSchema
} from './schemas/experiments.js';

interface ExperimentRouteContext {
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
  permission: 'analytics:view' | 'settings:manage'
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

export const experimentRoutes: Array<{
  method: string;
  pattern: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: ExperimentRouteContext
  ) => Promise<void>;
}> = [
  {
    method: 'GET',
    pattern: '/api/experiments',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'analytics:view')) return;
      const items = await listExperiments(ctx.db, orgCtx.organization.id);
      sendJson(res, 200, { items });
    }
  },
  {
    method: 'POST',
    pattern: '/api/experiments',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'settings:manage')) return;
      const body = validateBody(createExperimentSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      try {
        const experiment = await createExperiment(ctx.db, {
          ...body.data,
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id
        });
        sendJson(res, 201, experiment);
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'GET',
    pattern: '/api/experiments/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'analytics:view')) return;
      try {
        sendJson(
          res,
          200,
          await getExperiment(ctx.db, ctx.params.id, orgCtx.organization.id)
        );
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'POST',
    pattern: '/api/experiments/:id/start',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'settings:manage')) return;
      try {
        sendJson(
          res,
          200,
          await startExperiment(ctx.db, ctx.params.id, orgCtx.organization.id)
        );
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'POST',
    pattern: '/api/experiments/:id/stop',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'settings:manage')) return;
      try {
        sendJson(
          res,
          200,
          await stopExperiment(ctx.db, ctx.params.id, orgCtx.organization.id)
        );
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'POST',
    pattern: '/api/experiments/:id/assign',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'settings:manage')) return;
      const body = validateBody(assignExperimentSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      try {
        sendJson(
          res,
          200,
          await assignExperimentVariant(
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
    method: 'POST',
    pattern: '/api/experiments/:id/events',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'settings:manage')) return;
      const body = validateBody(experimentEventSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      try {
        const event = await recordExperimentEvent(
          ctx.db,
          ctx.params.id,
          orgCtx.organization.id,
          {
            assignmentId: body.data.assignmentId,
            metric: body.data.metric ?? 'conversion',
            value: body.data.value
          }
        );
        sendJson(res, 201, event);
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'GET',
    pattern: '/api/experiments/:id/results',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'analytics:view')) return;
      try {
        sendJson(
          res,
          200,
          await getExperimentResults(
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
