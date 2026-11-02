import { listOverdueFollowUps } from '@ai-growth-ops/database';
import { defineRoute, sendJson, type Route } from './route-kit.js';

export const followUpRoutes: Route[] = [
  defineRoute({
    method: 'GET',
    pattern: '/api/follow-ups/overdue',
    permission: 'lead:view',
    handler: async (_req, res, ctx) => {
      const items = await listOverdueFollowUps(
        ctx.db,
        ctx.org.organization.id,
        {
          ownerId: ctx.url.searchParams.get('ownerId'),
          limit: Number(ctx.url.searchParams.get('limit') || 200)
        }
      );
      sendJson(res, 200, { items, total: items.length });
    }
  })
];
