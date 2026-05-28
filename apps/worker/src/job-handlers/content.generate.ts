import { Job } from 'bullmq';
import type { ContentGenerateInput } from '../job-types.js';

export async function handleContentGenerate(job: Job<ContentGenerateInput>): Promise<void> {
  console.log(`[content.generate] Processing job ${job.id}`, job.data);
  // TODO: Implement real content generation logic
}
