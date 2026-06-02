/**
 * Scheduler
 *
 * Sets up repeating BullMQ jobs for periodic tasks like scheduled publish checking.
 */

import { getQueue } from './queue.js';
import { createLogger } from '@ai-growth-ops/observability';

const logger = createLogger('scheduler');

export const SCHEDULED_QUEUE = 'scheduled.checker';

export async function startScheduler(): Promise<void> {
  const queue = getQueue(SCHEDULED_QUEUE);

  // Add a repeating job that runs every 60 seconds
  // BullMQ's Repeat will handle deduplication — only one active repeat job per key
  await queue.add(
    SCHEDULED_QUEUE,
    { task: 'check-scheduled-publishes', triggeredAt: new Date().toISOString() },
    {
      repeat: { every: 60_000 },
      jobId: 'scheduled-checker-repeat',
    },
  );

  logger.info('Scheduler started — scheduled checker runs every 60s');
}
