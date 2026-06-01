import type { ServerResponse, IncomingMessage } from 'http';
import type { DatabaseClient } from '@ai-growth-ops/database';
import { getAuthenticatedUser } from './auth.js';

interface AnalyticsRouteContext {
  db: DatabaseClient;
  url: URL;
  params: Record<string, string>;
  body: unknown;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

export const analyticsRoutes: Array<{ method: string; pattern: string; handler: (req: IncomingMessage, res: ServerResponse, ctx: AnalyticsRouteContext) => Promise<void> }> = [
  // GET /api/analytics/events - List analytics events
  {
    method: 'GET',
    pattern: '/api/analytics/events',
    handler: async (req, res, ctx) => {
      const user = await getAuthenticatedUser(req, ctx.db);
      if (!user) return sendJson(res, 401, { error: '未登录' });
      const eventType = ctx.url.searchParams.get('eventType');
      const platform = ctx.url.searchParams.get('platform');
      const startDate = ctx.url.searchParams.get('startDate');
      const endDate = ctx.url.searchParams.get('endDate');
      const where: Record<string, unknown> = {};
      if (eventType) where.eventType = eventType;
      if (platform) where.platform = platform;
      if (startDate || endDate) {
        const occurredAt: Record<string, Date> = {};
        if (startDate) occurredAt.gte = new Date(startDate);
        if (endDate) occurredAt.lte = new Date(endDate);
        where.occurredAt = occurredAt;
      }
      const items = await ctx.db.analyticsEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: 200,
      });
      sendJson(res, 200, items);
    },
  },
  // POST /api/analytics/events - Create an analytics event
  {
    method: 'POST',
    pattern: '/api/analytics/events',
    handler: async (req, res, ctx) => {
      const user = await getAuthenticatedUser(req, ctx.db);
      if (!user) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown>;
      const item = await ctx.db.analyticsEvent.create({
        data: {
          eventType: String(body.eventType || ''),
          platform: body.platform ? String(body.platform) : null,
          entityType: body.entityType ? String(body.entityType) : null,
          entityId: body.entityId ? String(body.entityId) : null,
          value: body.value ? Number(body.value) : null,
          metadata: body.metadata as any || null,
          occurredAt: body.occurredAt ? new Date(body.occurredAt as string) : new Date(),
        },
      });
      sendJson(res, 201, item);
    },
  },
];

// Helper to track analytics events from any route
export async function trackEvent(
  db: DatabaseClient,
  data: { eventType: string; platform?: string; entityType?: string; entityId?: string; value?: number; metadata?: unknown }
): Promise<void> {
  await db.analyticsEvent.create({
    data: {
      eventType: data.eventType,
      platform: data.platform || null,
      entityType: data.entityType || null,
      entityId: data.entityId || null,
      value: data.value || null,
      metadata: (data.metadata || null) as any,
      occurredAt: new Date(),
    },
  });
}
