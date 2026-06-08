/**
 * Campaign Schedule Checker
 *
 * Runs every 5 minutes to find active campaigns due for execution.
 * Creates CampaignRun records and enqueues campaign.execute jobs.
 */

import { Job } from 'bullmq';
import { createDatabaseClient } from '@ai-growth-ops/database';
import { getQueue, QUEUE_NAMES } from '../queue.js';

export async function handleCampaignCheckSchedule(_job: Job): Promise<void> {
  const db = createDatabaseClient();
  const now = new Date();

  const campaigns = await db.campaign.findMany({
    where: {
      status: 'active',
      nextRunAt: { lte: now },
      deletedAt: null,
    },
  });

  if (campaigns.length === 0) return;

  console.log(`[campaign-scheduler] Found ${campaigns.length} campaign(s) due`);

  const campaignQueue = getQueue(QUEUE_NAMES.CAMPAIGN_EXECUTE);
  let enqueued = 0;

  for (const campaign of campaigns) {
    try {
      // Check maxPostsTotal limit
      if (campaign.maxPostsTotal && campaign.publishedCount >= campaign.maxPostsTotal) {
        await db.campaign.update({
          where: { id: campaign.id },
          data: { status: 'completed', finishedAt: new Date() },
        });
        continue;
      }

      // Create a CampaignRun
      const run = await db.campaignRun.create({
        data: {
          campaignId: campaign.id,
          status: 'pending',
          scheduledAt: now,
        },
      });

      // Enqueue execution
      await campaignQueue.add(QUEUE_NAMES.CAMPAIGN_EXECUTE, {
        campaignRunId: run.id,
      }, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
      });

      // Compute next run time
      const nextRun = computeNextRunAt(campaign.scheduleConfig as Record<string, unknown> | null);
      await db.campaign.update({
        where: { id: campaign.id },
        data: { nextRunAt: nextRun },
      });

      enqueued++;
    } catch (err) {
      console.error(`[campaign-scheduler] Failed for campaign ${campaign.id}:`, err);
    }
  }

  console.log(`[campaign-scheduler] Enqueued ${enqueued}/${campaigns.length}`);
}

function computeNextRunAt(config: Record<string, unknown> | null): Date {
  if (!config) {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    return next;
  }

  const days = (config.days as string[]) || [];
  const time = (config.time as string) || '09:00';
  const [hours, minutes] = time.split(':').map(Number);

  if (days.length > 0) {
    const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const targetDays = days.map(d => dayMap[d.toLowerCase()] ?? -1).filter(d => d >= 0);
    const now = new Date();
    const today = now.getDay();

    let minDiff = 8;
    for (const td of targetDays) {
      let diff = td - today;
      if (diff < 0) diff += 7;
      if (diff === 0) {
        if (now.getHours() > hours || (now.getHours() === hours && now.getMinutes() >= minutes)) {
          diff = 7;
        }
      }
      if (diff < minDiff) minDiff = diff;
    }

    const next = new Date(now);
    next.setDate(next.getDate() + minDiff);
    next.setHours(hours, minutes, 0, 0);
    return next;
  }

  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(hours, minutes, 0, 0);
  return next;
}
