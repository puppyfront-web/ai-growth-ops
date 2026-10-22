import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseClient } from '@ai-growth-ops/database';
import { resolveAcquisitionRange } from '@ai-growth-ops/shared';
import { getOrganizationContext } from './auth.js';
import { hasPermission } from './middleware/rbac.js';

interface WarehouseRouteContext {
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

export const warehouseRoutes: Array<{
  method: string;
  pattern: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: WarehouseRouteContext
  ) => Promise<void>;
}> = [
  {
    method: 'GET',
    pattern: '/api/export/warehouse.json',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'analytics:export')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const days = Number(ctx.url.searchParams.get('days') || 90);
      const range = resolveAcquisitionRange(
        Number.isFinite(days) ? Math.min(365, Math.max(1, days)) : 90
      );
      const organizationId = orgCtx.organization.id;

      const [customers, leads, deals, interactions, costs, outreach, experiments] =
        await Promise.all([
          ctx.db.customer.findMany({
            where: {
              organizationId,
              deletedAt: null,
              createdAt: { gte: range.from, lte: range.to }
            },
            select: {
              id: true,
              displayName: true,
              phone: true,
              company: true,
              role: true,
              intent: true,
              channel: true,
              status: true,
              assignedTo: true,
              fitScore: true,
              intentScore: true,
              healthScore: true,
              createdAt: true,
              updatedAt: true
            },
            take: 5000
          }),
          ctx.db.lead.findMany({
            where: {
              organizationId,
              deletedAt: null,
              createdAt: { gte: range.from, lte: range.to }
            },
            select: {
              id: true,
              customerId: true,
              sourcePlatform: true,
              level: true,
              status: true,
              intent: true,
              confidence: true,
              assignedTo: true,
              nextActionAt: true,
              createdAt: true
            },
            take: 5000
          }),
          ctx.db.deal.findMany({
            where: {
              organizationId,
              deletedAt: null,
              createdAt: { gte: range.from, lte: range.to }
            },
            select: {
              id: true,
              customerId: true,
              leadId: true,
              title: true,
              stage: true,
              amount: true,
              currency: true,
              ownerId: true,
              sourceChannel: true,
              expectedCloseDate: true,
              wonAt: true,
              lostReason: true,
              createdAt: true
            },
            take: 5000
          }),
          ctx.db.interaction.findMany({
            where: {
              organizationId,
              deletedAt: null,
              receivedAt: { gte: range.from, lte: range.to }
            },
            select: {
              id: true,
              platform: true,
              type: true,
              status: true,
              externalUserId: true,
              publishJobId: true,
              receivedAt: true
            },
            take: 5000
          }),
          ctx.db.marketingCost.findMany({
            where: {
              organizationId,
              deletedAt: null,
              incurredAt: { gte: range.from, lte: range.to }
            },
            select: {
              id: true,
              channel: true,
              contentItemId: true,
              category: true,
              amount: true,
              currency: true,
              incurredAt: true,
              note: true
            },
            take: 5000
          }),
          ctx.db.outreachTouch.findMany({
            where: {
              organizationId,
              createdAt: { gte: range.from, lte: range.to }
            },
            select: {
              id: true,
              channel: true,
              status: true,
              scheduledAt: true,
              sentAt: true,
              repliedAt: true,
              enrollment: { select: { customerId: true } }
            },
            take: 5000
          }),
          ctx.db.experiment.findMany({
            where: {
              organizationId,
              createdAt: { gte: range.from, lte: range.to }
            },
            select: {
              id: true,
              name: true,
              metric: true,
              status: true,
              variants: true,
              startedAt: true,
              endedAt: true
            },
            take: 500
          })
        ]);

      sendJson(res, 200, {
        exportedAt: new Date().toISOString(),
        organizationId,
        range: {
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          days: range.days
        },
        counts: {
          customers: customers.length,
          leads: leads.length,
          deals: deals.length,
          interactions: interactions.length,
          costs: costs.length,
          outreachTouches: outreach.length,
          experiments: experiments.length
        },
        customers,
        leads,
        deals,
        interactions,
        costs,
        outreachTouches: outreach.map((touch) => ({
          id: touch.id,
          channel: touch.channel,
          status: touch.status,
          scheduledAt: touch.scheduledAt,
          sentAt: touch.sentAt,
          repliedAt: touch.repliedAt,
          customerId: touch.enrollment.customerId
        })),
        experiments
      });
    }
  }
];
