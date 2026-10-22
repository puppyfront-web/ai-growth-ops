import type { Job } from 'bullmq';
import { createDatabaseClient, scanOutreach } from '@ai-growth-ops/database';

/**
 * Marks due outreach touches and escalates overdue follow-ups. It never sends
 * messages: sending remains an explicit human action in the outreach workbench.
 */
export async function handleOutreachCheck(_job: Job): Promise<void> {
  const db = createDatabaseClient();
  try {
    const result = await scanOutreach(db);
    console.log(
      `[outreach.check] due=${result.markedDue} escalated=${result.escalated}`
    );
  } finally {
    await db.$disconnect();
  }
}
