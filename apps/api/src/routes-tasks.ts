import type { ServerResponse, IncomingMessage } from 'http';
import type { DatabaseClient } from '@ai-growth-ops/database';
import { getAuthenticatedUser } from './auth.js';

interface TaskRouteContext {
  db: DatabaseClient;
  url: URL;
  params: Record<string, string>;
  body: unknown;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

export const taskRoutes: Array<{ method: string; pattern: string; handler: (req: IncomingMessage, res: ServerResponse, ctx: TaskRouteContext) => Promise<void> }> = [
  // GET /api/tasks - List all system tasks
  {
    method: 'GET',
    pattern: '/api/tasks',
    handler: async (req, res, ctx) => {
      const user = await getAuthenticatedUser(req, ctx.db);
      if (!user) return sendJson(res, 401, { error: '未登录' });
      const status = ctx.url.searchParams.get('status');
      const taskType = ctx.url.searchParams.get('taskType');
      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (taskType) where.taskType = taskType;
      const items = await ctx.db.systemTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      sendJson(res, 200, items);
    },
  },
  // GET /api/tasks/:id - Get task detail
  {
    method: 'GET',
    pattern: '/api/tasks/:id',
    handler: async (req, res, ctx) => {
      const user = await getAuthenticatedUser(req, ctx.db);
      if (!user) return sendJson(res, 401, { error: '未登录' });
      const item = await ctx.db.systemTask.findUnique({ where: { id: ctx.params.id } });
      if (!item) return sendJson(res, 404, { error: 'Not found' });
      sendJson(res, 200, item);
    },
  },
  // POST /api/tasks/:id/retry - Retry a failed task
  {
    method: 'POST',
    pattern: '/api/tasks/:id/retry',
    handler: async (req, res, ctx) => {
      const user = await getAuthenticatedUser(req, ctx.db);
      if (!user) return sendJson(res, 401, { error: '未登录' });
      const item = await ctx.db.systemTask.findUnique({ where: { id: ctx.params.id } });
      if (!item) return sendJson(res, 404, { error: 'Not found' });
      if (item.status !== 'failed') return sendJson(res, 400, { error: { code: 'INVALID_STATE', message: 'Only failed tasks can be retried' } });
      const updated = await ctx.db.systemTask.update({ where: { id: ctx.params.id }, data: { status: 'queued', errorMessage: null, startedAt: null, finishedAt: null } });
      sendJson(res, 200, updated);
    },
  },
  // POST /api/tasks/:id/cancel - Cancel a task
  {
    method: 'POST',
    pattern: '/api/tasks/:id/cancel',
    handler: async (req, res, ctx) => {
      const user = await getAuthenticatedUser(req, ctx.db);
      if (!user) return sendJson(res, 401, { error: '未登录' });
      const item = await ctx.db.systemTask.findUnique({ where: { id: ctx.params.id } });
      if (!item) return sendJson(res, 404, { error: 'Not found' });
      if (!['queued', 'running'].includes(item.status as string)) return sendJson(res, 400, { error: { code: 'INVALID_STATE', message: 'Only queued or running tasks can be cancelled' } });
      const updated = await ctx.db.systemTask.update({ where: { id: ctx.params.id }, data: { status: 'cancelled', finishedAt: new Date() } });
      sendJson(res, 200, updated);
    },
  },
];
