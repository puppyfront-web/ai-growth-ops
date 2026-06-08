/**
 * Scheduler
 *
 * Sets up repeating BullMQ jobs for periodic tasks like scheduled publish checking
 * and campaign schedule checking.
 */

import { getQueue, QUEUE_NAMES } from './queue.js';
import { createLogger } from '@ai-growth-ops/observability';

const logger = createLogger('scheduler');

export const SCHEDULED_QUEUE = 'scheduled.checker';
export const CAMPAIGN_CHECK_QUEUE = QUEUE_NAMES.CAMPAIGN_CHECK_SCHEDULE;

export async function startScheduler(): Promise<void> {
  // Scheduled publish checker — every 60 seconds
  const scheduledQueue = getQueue(SCHEDULED_QUEUE);
  await scheduledQueue.add(
    SCHEDULED_QUEUE,
    { task: 'check-scheduled-publishes', triggeredAt: new Date().toISOString() },
    {
      repeat: { every: 60_000 },
      jobId: 'scheduled-checker-repeat',
    },
  );
  logger.info('Scheduler started — scheduled checker runs every 60s');

  // Campaign schedule checker — every 5 minutes
  const campaignQueue = getQueue(CAMPAIGN_CHECK_QUEUE);
  await campaignQueue.add(
    CAMPAIGN_CHECK_QUEUE,
    { task: 'check-campaign-schedule', triggeredAt: new Date().toISOString() },
    {
      repeat: { every: 300_000 },
      jobId: 'campaign-check-repeat',
    },
  );
  logger.info('Campaign scheduler started — campaign checker runs every 5min');
}
