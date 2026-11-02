import { defineRoute, sendJson, type Route } from './route-kit.js';

export const notificationRoutes: Route[] = [
  // GET /api/notifications - List notifications
  defineRoute({
    method: 'GET',
    pattern: '/api/notifications',
    handler: async (_req, res, ctx) => {
      const unreadOnly = ctx.url.searchParams.get('unread') === 'true';
      const where: Record<string, unknown> = {
        organizationId: ctx.org.organization.id
      };
      if (unreadOnly) where.readAt = null;
      const items = await ctx.db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      sendJson(res, 200, items);
    }
  }),
  // GET /api/notifications/unread-count - Get unread count
  defineRoute({
    method: 'GET',
    pattern: '/api/notifications/unread-count',
    handler: async (_req, res, ctx) => {
      const count = await ctx.db.notification.count({
        where: { organizationId: ctx.org.organization.id, readAt: null }
      });
      sendJson(res, 200, { count });
    }
  }),
  // PATCH /api/notifications/:id/read - Mark notification as read
  defineRoute({
    method: 'PATCH',
    pattern: '/api/notifications/:id/read',
    handler: async (_req, res, ctx) => {
      const item = await ctx.db.notification.findUnique({
        where: { id: ctx.params.id }
      });
      if (!item) return sendJson(res, 404, { error: 'Not found' });
      const updated = await ctx.db.notification.update({
        where: { id: ctx.params.id },
        data: { readAt: new Date() }
      });
      sendJson(res, 200, updated);
    }
  }),
  // POST /api/notifications/mark-all-read - Mark all as read
  defineRoute({
    method: 'POST',
    pattern: '/api/notifications/mark-all-read',
    handler: async (_req, res, ctx) => {
      await ctx.db.notification.updateMany({
        where: { organizationId: ctx.org.organization.id, readAt: null },
        data: { readAt: new Date() }
      });
      sendJson(res, 200, { ok: true });
    }
  })
];
