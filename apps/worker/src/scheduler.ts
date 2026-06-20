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
export const INTERACTION_SYNC_QUEUE = QUEUE_NAMES.SCHEDULED_INTERACTION_SYNC;

export async function startScheduler(): Promise<void> {
  // Scheduled publish checker — every 60 seconds
  const scheduledQueue = getQueue(SCHEDULED_QUEUE);
  await scheduledQueue.add(
    SCHEDULED_QUEUE,
    {
      task: 'check-scheduled-publishes',
      triggeredAt: new Date().toISOString()
    },
    {
      repeat: { every: 60_000 },
      jobId: 'scheduled-checker-repeat'
    }
  );
  logger.info('Scheduler started — scheduled checker runs every 60s');

  // Campaign schedule checker — every 5 minutes
  const campaignQueue = getQueue(CAMPAIGN_CHECK_QUEUE);
  await campaignQueue.add(
    CAMPAIGN_CHECK_QUEUE,
    { task: 'check-campaign-schedule', triggeredAt: new Date().toISOString() },
    {
      repeat: { every: 300_000 },
      jobId: 'campaign-check-repeat'
    }
  );
  logger.info('Campaign scheduler started — campaign checker runs every 5min');

  // Periodic interaction sync — every 30 minutes
  const interactionSyncQueue = getQueue(INTERACTION_SYNC_QUEUE);
  await interactionSyncQueue.add(
    INTERACTION_SYNC_QUEUE,
    { task: 'sync-all-interactions', triggeredAt: new Date().toISOString() },
    {
      repeat: { every: 1_800_000 }, // 30 minutes
      jobId: 'interaction-sync-repeat'
    }
  );
  logger.info('Interaction sync scheduler started — sync runs every 30min');

  // Daily agent run — enqueues an AgentRun for the default admin/org every 24h.
  // Per-org enable + custom cron is a follow-up; first slice is single-tenant daily.
  const agentRunQueue = getQueue(QUEUE_NAMES.AGENT_RUN);
  await agentRunQueue.add(
    QUEUE_NAMES.AGENT_RUN,
    { task: 'daily-agent-run', triggeredAt: new Date().toISOString() },
    {
      repeat: { every: 86_400_000 }, // 24 hours
      jobId: 'agent-daily-run-repeat'
    }
  );
  logger.info('Agent run scheduler started — daily agent run every 24h');
}
