import type { ServerResponse, IncomingMessage } from 'http';
import type { DatabaseClient } from '@ai-growth-ops/database';
import type { AuditAction } from '@prisma/client';

interface AuditRouteContext {
  db: DatabaseClient;
  url: URL;
  params: Record<string, string>;
  body: unknown;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

export const auditRoutes: Array<{ method: string; pattern: string; handler: (req: IncomingMessage, res: ServerResponse, ctx: AuditRouteContext) => Promise<void> }> = [
  // GET /api/audit-logs - List audit logs
  {
    method: 'GET',
    pattern: '/api/audit-logs',
    handler: async (_req, res, ctx) => {
      const action = ctx.url.searchParams.get('action');
      const entity = ctx.url.searchParams.get('entityType') ?? ctx.url.searchParams.get('entity');
      const userId = ctx.url.searchParams.get('userId');
      const where: Record<string, unknown> = {};
      if (action) where.action = action;
      if (entity) where.entity = entity;
      if (userId) where.userId = userId;
      const items = await ctx.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      sendJson(res, 200, items);
    },
  },
];

// Helper to write audit logs from any route
export async function writeAuditLog(
  db: DatabaseClient,
  data: { userId: string; action: AuditAction; entity: string; entityId: string; before?: unknown; after?: unknown }
): Promise<void> {
  const changes = (data.before !== undefined || data.after !== undefined)
    ? { before: data.before ?? null, after: data.after ?? null }
    : undefined;

  await db.auditLog.create({
    data: {
      userId: data.userId,
      action: data.action,
      entity: data.entity,
      entityId: data.entityId,
      changes: changes as never,
    },
  });
}

// Helper to create notifications
export async function createNotification(
  db: DatabaseClient,
  data: { type: string; title: string; content: string; level?: string; userId?: string; actionUrl?: string }
): Promise<void> {
  await db.notification.create({
    data: {
      type: data.type,
      title: data.title,
      content: data.content,
      level: (data.level || 'info') as any,
      userId: data.userId,
      actionUrl: data.actionUrl,
    },
  });
}

// Helper to create system tasks
export async function createSystemTask(
  db: DatabaseClient,
  data: { taskType: string; title: string; relatedEntityType?: string; relatedEntityId?: string; createdBy?: string }
) {
  return db.systemTask.create({
    data: {
      taskType: data.taskType,
      title: data.title,
      relatedEntityType: data.relatedEntityType,
      relatedEntityId: data.relatedEntityId,
      createdBy: data.createdBy,
    },
  });
}
