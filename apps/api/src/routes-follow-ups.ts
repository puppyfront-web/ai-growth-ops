import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseClient } from '@ai-growth-ops/database';
import { listOverdueFollowUps } from '@ai-growth-ops/database';
import { getOrganizationContext } from './auth.js';
import { hasPermission } from './middleware/rbac.js';

interface FollowUpRouteContext {
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

export const followUpRoutes: Array<{
  method: string;
  pattern: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: FollowUpRouteContext
  ) => Promise<void>;
}> = [
  {
    method: 'GET',
    pattern: '/api/follow-ups/overdue',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'lead:view')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const items = await listOverdueFollowUps(
        ctx.db,
        orgCtx.organization.id,
        {
          ownerId: ctx.url.searchParams.get('ownerId'),
          limit: Number(ctx.url.searchParams.get('limit') || 200)
        }
      );
      sendJson(res, 200, { items, total: items.length });
    }
  }
];
