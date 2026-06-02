import type { ServerResponse, IncomingMessage } from 'http';
import type { DatabaseClient } from '@ai-growth-ops/database';
import { getOrganizationContext } from './auth.js';

interface NotificationRouteContext {
  db: DatabaseClient;
  url: URL;
  params: Record<string, string>;
  body: unknown;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

export const notificationRoutes: Array<{ method: string; pattern: string; handler: (req: IncomingMessage, res: ServerResponse, ctx: NotificationRouteContext) => Promise<void> }> = [
  // GET /api/notifications - List notifications
  {
    method: 'GET',
    pattern: '/api/notifications',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const unreadOnly = ctx.url.searchParams.get('unread') === 'true';
      const where: Record<string, unknown> = { organizationId: orgCtx.organization.id };
      if (unreadOnly) where.readAt = null;
      const items = await ctx.db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      sendJson(res, 200, items);
    },
  },
  // PATCH /api/notifications/:id/read - Mark notification as read
  {
    method: 'PATCH',
    pattern: '/api/notifications/:id/read',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const item = await ctx.db.notification.findUnique({ where: { id: ctx.params.id } });
      if (!item) return sendJson(res, 404, { error: 'Not found' });
      const updated = await ctx.db.notification.update({ where: { id: ctx.params.id }, data: { readAt: new Date() } });
      sendJson(res, 200, updated);
    },
  },
  // POST /api/notifications/mark-all-read - Mark all as read
  {
    method: 'POST',
    pattern: '/api/notifications/mark-all-read',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      await ctx.db.notification.updateMany({ where: { organizationId: orgCtx.organization.id, readAt: null }, data: { readAt: new Date() } });
      sendJson(res, 200, { ok: true });
    },
  },
];
