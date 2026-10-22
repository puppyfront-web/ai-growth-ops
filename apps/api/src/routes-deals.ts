import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseClient } from '@ai-growth-ops/database';
import {
  DealNotFoundError,
  DealValidationError,
  addDealActivity,
  createDeal,
  getDeal,
  getDealPipeline,
  listDeals,
  listOverdueDeals,
  softDeleteDeal,
  updateDeal
} from '@ai-growth-ops/database';
import { getOrganizationContext } from './auth.js';
import { parsePagination } from './middleware/pagination.js';
import { validateBody } from './middleware/validate.js';
import { hasPermission } from './middleware/rbac.js';
import { fireWebhook } from './services/webhook-service.js';
import {
  addDealActivitySchema,
  createDealSchema,
  updateDealSchema
} from './schemas/deals.js';

interface DealRouteContext {
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
  permission: 'lead:view' | 'lead:edit'
): boolean {
  if (hasPermission(role, permission)) return true;
  sendJson(res, 403, { error: '权限不足' });
  return false;
}

function toDate(
  value: string | null | undefined
): Date | null | undefined {
  if (value === undefined || value === null) return value;
  return new Date(value);
}

function handleDealError(res: ServerResponse, error: unknown): void {
  if (error instanceof DealNotFoundError) {
    sendJson(res, 404, { error: error.message });
    return;
  }
  if (error instanceof DealValidationError) {
    sendJson(res, 400, { error: error.message });
    return;
  }
  throw error;
}

export const dealRoutes: Array<{
  method: string;
  pattern: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: DealRouteContext
  ) => Promise<void>;
}> = [
  {
    method: 'GET',
    pattern: '/api/deals/pipeline',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;
      const days = Number(ctx.url.searchParams.get('days') || 30);
      const pipeline = await getDealPipeline(
        ctx.db,
        orgCtx.organization.id,
        Number.isFinite(days) ? days : 30
      );
      sendJson(res, 200, pipeline);
    }
  },
  {
    method: 'GET',
    pattern: '/api/deals/overdue',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;
      const items = await listOverdueDeals(
        ctx.db,
        orgCtx.organization.id
      );
      sendJson(res, 200, { items });
    }
  },
  {
    method: 'GET',
    pattern: '/api/deals',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;
      const { page, pageSize } = parsePagination(ctx.url);
      try {
        const result = await listDeals(ctx.db, {
          organizationId: orgCtx.organization.id,
          stage: ctx.url.searchParams.get('stage'),
          customerId: ctx.url.searchParams.get('customerId'),
          ownerId: ctx.url.searchParams.get('ownerId'),
          q: ctx.url.searchParams.get('q'),
          page,
          pageSize
        });
        sendJson(res, 200, result);
      } catch (error) {
        handleDealError(res, error);
      }
    }
  },
  {
    method: 'POST',
    pattern: '/api/deals',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      const bodyResult = validateBody(createDealSchema, ctx.body);
      if (!bodyResult.success) {
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      }
      try {
        const body = bodyResult.data;
        const deal = await createDeal(ctx.db, {
          ...body,
          expectedCloseDate: toDate(body.expectedCloseDate),
          nextActionAt: toDate(body.nextActionAt),
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id
        });
        sendJson(res, 201, deal);
        if (deal.stage === 'won' || deal.stage === 'lost') {
          await fireWebhook(
            ctx.db,
            orgCtx.organization.id,
            `deal.${deal.stage}`,
            {
              dealId: deal.id,
              customerId: deal.customerId,
              stage: deal.stage,
              amount: deal.amount?.toString() ?? null,
              currency: deal.currency
            }
          ).catch(() => undefined);
        }
      } catch (error) {
        handleDealError(res, error);
      }
    }
  },
  {
    method: 'POST',
    pattern: '/api/deals/:id/activities',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      const bodyResult = validateBody(addDealActivitySchema, ctx.body);
      if (!bodyResult.success) {
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      }
      try {
        const body = bodyResult.data;
        const activity = await addDealActivity(
          ctx.db,
          ctx.params.id,
          orgCtx.organization.id,
          {
            ...body,
            nextActionAt: toDate(body.nextActionAt),
            operator: orgCtx.user.name
          }
        );
        sendJson(res, 201, activity);
      } catch (error) {
        handleDealError(res, error);
      }
    }
  },
  {
    method: 'GET',
    pattern: '/api/deals/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:view')) return;
      try {
        const deal = await getDeal(
          ctx.db,
          ctx.params.id,
          orgCtx.organization.id
        );
        sendJson(res, 200, deal);
      } catch (error) {
        handleDealError(res, error);
      }
    }
  },
  {
    method: 'PUT',
    pattern: '/api/deals/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      const bodyResult = validateBody(updateDealSchema, ctx.body);
      if (!bodyResult.success) {
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      }
      try {
        const body = bodyResult.data;
        const deal = await updateDeal(
          ctx.db,
          ctx.params.id,
          orgCtx.organization.id,
          {
            ...body,
            expectedCloseDate: toDate(body.expectedCloseDate),
            nextActionAt: toDate(body.nextActionAt),
            operator: orgCtx.user.name
          }
        );
        sendJson(res, 200, deal);
        if (deal.stage === 'won' || deal.stage === 'lost') {
          await fireWebhook(
            ctx.db,
            orgCtx.organization.id,
            `deal.${deal.stage}`,
            {
              dealId: deal.id,
              customerId: deal.customerId,
              stage: deal.stage,
              amount: deal.amount?.toString() ?? null,
              currency: deal.currency
            }
          ).catch(() => undefined);
        }
      } catch (error) {
        handleDealError(res, error);
      }
    }
  },
  {
    method: 'DELETE',
    pattern: '/api/deals/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!canAccess(res, orgCtx.memberRole, 'lead:edit')) return;
      try {
        const result = await softDeleteDeal(
          ctx.db,
          ctx.params.id,
          orgCtx.organization.id,
          orgCtx.user.name
        );
        sendJson(res, 200, result);
      } catch (error) {
        handleDealError(res, error);
      }
    }
  }
];
