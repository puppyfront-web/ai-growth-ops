import { createDatabaseClient } from '@ai-growth-ops/database';
import { createLogger } from '@ai-growth-ops/observability';

const logger = createLogger('worker');

const STUCK_PROGRESS_MS = 8 * 60_000;

type TaskMetadata = {
  phase?: string;
  updatedAt?: string;
};

function progressStuckMs(metadata: unknown, startedAt: Date | null): number {
  const meta = metadata as TaskMetadata | null;
  const anchor = meta?.updatedAt
    ? Date.parse(meta.updatedAt)
    : startedAt?.getTime();
  if (!anchor || Number.isNaN(anchor)) return Number.POSITIVE_INFINITY;
  return Date.now() - anchor;
}

/** Mark running tasks as failed when their BullMQ job is gone or stuck. */
export async function recoverOrphanedProspectingTasks(): Promise<void> {
  const db = createDatabaseClient();
  const { Queue } = await import('bullmq');
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const queue = new Queue('prospecting.run', {
    connection: { url: redisUrl }
  });

  try {
    const running = await db.prospectingTask.findMany({
      where: { status: 'running' },
      select: { id: true, startedAt: true, metadata: true }
    });

    const redis = await queue.client;
    const stalledKey = `${queue.opts.prefix}:prospecting.run:stalled`;

    for (const task of running) {
      const job = await queue.getJob(task.id);
      const state = job ? await job.getState() : null;
      const isStalled = Boolean(
        await redis.sismember(stalledKey, task.id)
      );
      const stuckMs = progressStuckMs(task.metadata, task.startedAt);

      if (
        state === 'waiting' ||
        state === 'delayed' ||
        (state === 'active' && !isStalled && stuckMs < STUCK_PROGRESS_MS)
      ) {
        continue;
      }

      if (job) {
        try {
          await job.remove();
        } catch {
          await redis.del(`${queue.opts.prefix}:prospecting.run:${task.id}:lock`);
          await redis.lrem(`${queue.opts.prefix}:prospecting.run:active`, 0, task.id);
          await redis.srem(stalledKey, task.id);
          await job.remove().catch(() => undefined);
        }
      }

      const staleMinutes = task.startedAt
        ? (Date.now() - task.startedAt.getTime()) / 60_000
        : 0;

      await db.prospectingTask.updateMany({
        where: { id: task.id, status: 'running' },
        data: {
          status: 'failed',
          executionToken: null,
          finishedAt: new Date(),
          lastError:
            isStalled || stuckMs >= STUCK_PROGRESS_MS
              ? '任务在分析潜客阶段中断，请重新点击「重新执行」'
              : staleMinutes > 30
                ? '任务执行超时，请重新点击「开始执行」'
                : '任务执行中断（Worker 未运行），请重新点击「开始执行」'
        }
      });
      logger.info(`Recovered orphaned prospecting task ${task.id}`);
    }
  } finally {
    await queue.close();
    await db.$disconnect();
  }
}
