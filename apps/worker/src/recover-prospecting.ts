import { createDatabaseClient } from '@ai-growth-ops/database';
import { createLogger } from '@ai-growth-ops/observability';

const logger = createLogger('worker');

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
      select: { id: true, executionToken: true }
    });

    for (const task of running) {
      const job = await queue.getJob(task.id);
      const state = job ? await job.getState() : null;
      // BullMQ owns locks and stalled-job recovery; stale UI progress is not proof of an orphan.
      if (state && !['completed', 'failed', 'unknown'].includes(state)) continue;

      await db.prospectingTask.updateMany({
        where: { id: task.id, status: 'running', executionToken: task.executionToken },
        data: {
          status: 'failed',
          executionToken: null,
          finishedAt: new Date(),
          lastError: '任务执行中断，请重新点击「开始执行」'
        }
      });
      logger.info(`Recovered orphaned prospecting task ${task.id}`);
    }
  } finally {
    await queue.close();
    await db.$disconnect();
  }
}
