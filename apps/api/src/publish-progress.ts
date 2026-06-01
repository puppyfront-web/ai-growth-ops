import type { DatabaseClient } from '@ai-growth-ops/database';
import {
  buildPublishProgress,
  type PublishProgressStage,
} from '@ai-growth-ops/shared';

export async function applyPublishProgress(
  db: DatabaseClient,
  publishJobId: string,
  stage: PublishProgressStage,
  message?: string
): Promise<void> {
  const progress = buildPublishProgress(stage, message);
  const job = await db.publishJob.findFirst({
    where: { id: publishJobId, deletedAt: null },
    select: { metadata: true },
  });
  if (!job) return;

  const metadata =
    job.metadata && typeof job.metadata === 'object' && !Array.isArray(job.metadata)
      ? (job.metadata as Record<string, unknown>)
      : {};

  await db.publishJob.update({
    where: { id: publishJobId },
    data: { metadata: { ...metadata, progress } },
  });
}

export function isPublishProgressAuthorized(req: import('node:http').IncomingMessage): boolean {
  const secret = process.env.PUBLISH_PROGRESS_SECRET;
  if (!secret) return false;
  const key = req.headers['x-publish-progress-key'];
  if (typeof key !== 'string') return false;
  try {
    const { timingSafeEqual } = require('node:crypto');
    const a = Buffer.from(key);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
