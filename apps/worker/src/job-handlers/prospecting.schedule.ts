import type { Job } from 'bullmq';
import {
  claimScheduledProspectingTasks,
  createDatabaseClient
} from '@ai-growth-ops/database';
import { getQueue, QUEUE_NAMES } from '../queue.js';

/**
 * Claims due scheduled prospecting tasks and enqueues the existing run handler.
 * Quota/captcha/account failures are recorded on the task and retried next cycle.
 */
export async function handleProspectingSchedule(_job: Job): Promise<void> {
  const db = createDatabaseClient();
  try {
    const { claimed, skipped } = await claimScheduledProspectingTasks(db);
    const queue = getQueue(QUEUE_NAMES.PROSPECTING_RUN);
    for (const task of claimed) {
      await queue.add(
        QUEUE_NAMES.PROSPECTING_RUN,
        {
          taskId: task.taskId,
          organizationId: task.organizationId,
          userId: task.userId,
          executionToken: task.executionToken
        },
        { attempts: 1, removeOnComplete: 100 }
      );
    }
    console.log(
      `[prospecting.schedule] claimed=${claimed.length} skipped=${skipped.length}`
    );
  } finally {
    await db.$disconnect();
  }
}
