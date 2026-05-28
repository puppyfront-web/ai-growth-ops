import { Job } from 'bullmq';
import type { ContentRewriteInput } from '../job-types.js';

export async function handleContentRewrite(job: Job<ContentRewriteInput>): Promise<void> {
  console.log(`[content.rewrite] Processing job ${job.id}`, job.data);
  // TODO: Implement real content rewrite logic
}
