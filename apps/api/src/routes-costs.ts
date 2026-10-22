import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseClient } from '@ai-growth-ops/database';
import {
  createMarketingCost,
  deleteMarketingCost,
  listMarketingCosts,
  updateMarketingCost
} from '@ai-growth-ops/database';
import {
  buildForecast,
  resolveAcquisitionRange,
  type ForecastStage
} from '@ai-growth-ops/shared';
import { getOrganizationContext } from './auth.js';
import { hasPermission } from './middleware/rbac.js';
import { validateBody } from './middleware/validate.js';
import {
  createMarketingCostSchema,
  updateMarketingCostSchema
} from './schemas/costs.js';
import {
  getAttributionAnalytics,
  getEfficiencyAnalytics
} from './services/efficiency-analytics.js';

interface CostRouteContext {
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

function daysFrom(url: URL): number {
  const days = Number(url.searchParams.get('days') || 30);
  return Number.isFinite(days) ? Math.min(180, Math.max(1, days)) : 30;
}

function handleError(res: ServerResponse, error: unknown) {
  sendJson(res, 400, {
    error: error instanceof Error ? error.message : '操作失败'
  });
}

export const costRoutes: Array<{
  method: string;
  pattern: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: CostRouteContext
  ) => Promise<void>;
}> = [
  {
    method: 'GET',
    pattern: '/api/analytics/efficiency',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'analytics:view')) return;
      const payload = await getEfficiencyAnalytics(
        ctx.db,
        orgCtx.organization.id,
        daysFrom(ctx.url)
      );
      sendJson(res, 200, payload);
    }
  },
  {
    method: 'GET',
    pattern: '/api/analytics/forecast',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'analytics:view')) return;
      const months = Number(ctx.url.searchParams.get('months') || 6);
      const deals = await ctx.db.deal.findMany({
        where: {
          organizationId: orgCtx.organization.id,
          deletedAt: null,
          stage: { notIn: ['won', 'lost'] }
        },
        select: {
          id: true,
          stage: true,
          amount: true,
          expectedCloseDate: true
        }
      });
      const payload = buildForecast(
        deals.map((deal) => ({
          id: deal.id,
          stage: deal.stage as ForecastStage,
          amount: Number(deal.amount ?? 0),
          expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null
        })),
        new Date(),
        Number.isFinite(months) ? Math.min(24, Math.max(1, months)) : 6
      );
      sendJson(res, 200, payload);
    }
  },
  {
    method: 'GET',
    pattern: '/api/analytics/attribution',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'analytics:view')) return;
      const raw = ctx.url.searchParams.get('model') || 'last_touch';
      const model =
        raw === 'first_touch' || raw === 'linear' ? raw : 'last_touch';
      const payload = await getAttributionAnalytics(
        ctx.db,
        orgCtx.organization.id,
        daysFrom(ctx.url),
        model
      );
      sendJson(res, 200, payload);
    }
  },
  {
    method: 'GET',
    pattern: '/api/costs',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'analytics:view')) return;
      const range = resolveAcquisitionRange(daysFrom(ctx.url));
      const items = await listMarketingCosts(
        ctx.db,
        orgCtx.organization.id,
        {
          from: range.from,
          to: range.to,
          channel: ctx.url.searchParams.get('channel') ?? undefined
        }
      );
      sendJson(res, 200, { items });
    }
  },
  {
    method: 'POST',
    pattern: '/api/costs',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'settings:manage')) return;
      const body = validateBody(createMarketingCostSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      try {
        const cost = await createMarketingCost(ctx.db, {
          ...body.data,
          incurredAt: body.data.incurredAt
            ? new Date(body.data.incurredAt)
            : undefined,
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id
        });
        sendJson(res, 201, cost);
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'PUT',
    pattern: '/api/costs/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'settings:manage')) return;
      const body = validateBody(updateMarketingCostSchema, ctx.body);
      if (!body.success) {
        return sendJson(res, 400, { error: '输入验证失败', errors: body.errors });
      }
      try {
        const cost = await updateMarketingCost(
          ctx.db,
          ctx.params.id,
          orgCtx.organization.id,
          {
            ...body.data,
            incurredAt: body.data.incurredAt
              ? new Date(body.data.incurredAt)
              : undefined
          }
        );
        sendJson(res, 200, cost);
      } catch (error) {
        handleError(res, error);
      }
    }
  },
  {
    method: 'DELETE',
    pattern: '/api/costs/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'settings:manage')) return;
      try {
        sendJson(
          res,
          200,
          await deleteMarketingCost(
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
