/**
 * Periodic Interaction Sync Scheduler
 *
 * Runs every 30 minutes to auto-sync comments and messages
 * for all active browser-assist platform accounts.
 */

import { Job } from 'bullmq';
import { createDatabaseClient } from '@ai-growth-ops/database';
import { getQueue, QUEUE_NAMES } from '../queue.js';

export async function handleScheduledInteractionSync(_job: Job): Promise<void> {
  const db = createDatabaseClient();

  // Find all active browser-assist platform accounts
  const accounts = await db.platformAccount.findMany({
    where: {
      mode: 'browser_assist',
      deletedAt: null,
      status: 'active',
    },
  });

  if (accounts.length === 0) return;

  console.log(`[interaction-sync-scheduler] Syncing ${accounts.length} account(s)`);

  const commentsQueue = getQueue(QUEUE_NAMES.INTERACTION_SYNC_COMMENTS);
  const messagesQueue = getQueue(QUEUE_NAMES.INTERACTION_SYNC_MESSAGES);

  let enqueued = 0;

  for (const account of accounts) {
    // Check per-account sync config
    const metadata = account.metadata as Record<string, unknown> | null;
    const syncConfig = metadata?.syncConfig as Record<string, unknown> | undefined;
    if (syncConfig?.enabled === false) continue;

    try {
      await commentsQueue.add(QUEUE_NAMES.INTERACTION_SYNC_COMMENTS, {
        platform: account.platform,
        platformAccountId: account.id,
      }, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        jobId: `sync-comments-${account.id}-${Date.now()}`,
      });

      await messagesQueue.add(QUEUE_NAMES.INTERACTION_SYNC_MESSAGES, {
        platform: account.platform,
        platformAccountId: account.id,
      }, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        jobId: `sync-messages-${account.id}-${Date.now()}`,
      });

      enqueued++;
    } catch (err) {
      console.error(`[interaction-sync-scheduler] Failed for account ${account.id}:`, err);
    }
  }

  console.log(`[interaction-sync-scheduler] Enqueued sync for ${enqueued}/${accounts.length} accounts`);
}
