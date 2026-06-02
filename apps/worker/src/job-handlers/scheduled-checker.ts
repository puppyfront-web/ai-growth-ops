/**
 * Scheduled Publish Checker
 *
 * Runs periodically (every 60s) to find PublishJobs that are due
 * and enqueues them to the publish.execute queue.
 */

import { Job } from 'bullmq';
import { createDatabaseClient } from '@ai-growth-ops/database';
import { getQueue, QUEUE_NAMES } from '../queue.js';

export async function handleScheduledChecker(_job: Job): Promise<void> {
  const db = createDatabaseClient();
  const now = new Date();

  // Find all scheduled jobs that are due
  const dueJobs = await db.publishJob.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { lte: now },
      deletedAt: null,
    },
    include: {
      contentVariant: { select: { id: true } },
      platformAccount: { select: { id: true } },
    },
  });

  if (dueJobs.length === 0) return;

  console.log(`[scheduled-checker] Found ${dueJobs.length} due publish job(s)`);

  const publishQueue = getQueue(QUEUE_NAMES.PUBLISH_EXECUTE);
  let enqueued = 0;

  for (const job of dueJobs) {
    try {
      // Mark as RUNNING to prevent double-enqueue
      await db.publishJob.update({
        where: { id: job.id },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      await publishQueue.add(QUEUE_NAMES.PUBLISH_EXECUTE, {
        publishJobId: job.id,
        contentVariantId: job.contentVariantId,
        platformAccountId: job.platformAccountId,
        platform: job.platform,
        contentType: job.contentType,
        mode: job.mode,
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });

      enqueued++;
    } catch (err) {
      console.error(`[scheduled-checker] Failed to enqueue job ${job.id}:`, err);
      // Revert status so it can be picked up next cycle
      await db.publishJob.update({
        where: { id: job.id },
        data: { status: 'SCHEDULED' },
      }).catch(() => {});
    }
  }

  console.log(`[scheduled-checker] Enqueued ${enqueued}/${dueJobs.length} jobs`);
}
