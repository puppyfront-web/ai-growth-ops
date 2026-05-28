import type { DatabaseClient } from '@ai-growth-ops/database';
import {
  buildPublishProgress,
  type PublishProgressStage,
} from '@ai-growth-ops/shared';

export async function updatePublishProgress(
  db: DatabaseClient,
  publishJobId: string,
  stage: PublishProgressStage,
  message?: string
): Promise<void> {
  const progress = buildPublishProgress(stage, message);
  const job = await db.publishJob.findFirst({
    where: { id: publishJobId },
    select: { metadata: true },
  });
  const metadata =
    job?.metadata && typeof job.metadata === 'object' && !Array.isArray(job.metadata)
      ? (job.metadata as Record<string, unknown>)
      : {};
  await db.publishJob.update({
    where: { id: publishJobId },
    data: { metadata: { ...metadata, progress } },
  });
}
