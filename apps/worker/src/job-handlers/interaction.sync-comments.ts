import type { PlatformCode, InteractionMode } from '@ai-growth-ops/connectors';
import { getOrCreateConnector } from '@ai-growth-ops/connectors';
import { createDatabaseClient } from '@ai-growth-ops/database';
import type { DatabaseClient } from '@ai-growth-ops/database';
import { decryptToken } from '@ai-growth-ops/providers';
import type { Job } from 'bullmq';
import type { InteractionSyncCommentsInput } from '../job-types.js';
import { prepareCommentsForSync } from './interaction-sync-utils.js';
import { classifyAndSuggestReply } from './interaction-pipeline.js';

export async function handleInteractionSyncComments(
  job: Job<InteractionSyncCommentsInput>
): Promise<void> {
  const {
    userId,
    platformAccountId,
    platform,
    mode,
    headed,
    sourceContentId,
    cursor,
    limit,
    syncJobId,
  } = job.data;
  const db: DatabaseClient = createDatabaseClient();

  // Update sync job status to running
  if (syncJobId) {
    await db.interactionSyncJob.update({
      where: { id: syncJobId },
      data: { status: 'running', startedAt: new Date() },
    });
  }

  try {
    // Resolve credentials from the platform account
    const account = await db.platformAccount.findFirst({
      where: { id: platformAccountId },
    });

    const cookie = account?.cookieRef ? decryptToken(account.cookieRef) : undefined;
    const accessToken = account?.accessTokenEncrypted
      ? decryptToken(account.accessTokenEncrypted)
      : undefined;

    const connector = getOrCreateConnector(
      platform as PlatformCode,
      mode as InteractionMode,
      { mode: mode as InteractionMode, cookie, accessToken, headed },
    );

    // Fetch comments from platform
    const fetchedComments = await connector.fetchComments({
      platformAccountId,
      sourceContentId,
      cursor,
      limit: limit || 50,
      headed,
    });
    const comments = prepareCommentsForSync(fetchedComments);

    // Process and deduplicate
    let newCount = 0;
    let skippedCount = 0;

    for (const comment of comments) {
      // Check if already exists by the unique constraint (platformAccountId + externalInteractionId)
      const existing = await db.interaction.findFirst({
        where: {
          platformAccountId,
          externalInteractionId: comment.externalCommentId,
        },
      });

      if (existing) {
        skippedCount++;
        continue;
      }

      // Create interaction record
      const interaction = await db.interaction.create({
        data: {
          userId,
          organizationId: account?.organizationId || '',
          externalInteractionId: comment.externalCommentId,
          platformAccountId,
          platform: platform as any,
          type: 'comment',
          status: 'NEW',
          content: comment.content,
          externalUserId: comment.externalUserId,
          externalUserName: comment.userNickname,
          rawPayload: (comment.rawPayload as any) ?? undefined,
        },
      });
      newCount++;

      // Inline classify + reply suggestion
      await classifyAndSuggestReply(
        db,
        interaction.id,
        comment.content,
        platform,
        'comment',
      );
    }

    // Update sync job as completed
    if (syncJobId) {
      await db.interactionSyncJob.update({
        where: { id: syncJobId },
        data: {
          status: 'completed',
          finishedAt: new Date(),
          fetchedCount: comments.length,
        },
      });
    }

    job.log(
      `Synced ${comments.length}/${fetchedComments.length} comments after today-filter: ${newCount} new, ${skippedCount} duplicates`
    );
  } catch (err) {
    // Update sync job as failed
    if (syncJobId) {
      await db.interactionSyncJob.update({
        where: { id: syncJobId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
    }
    throw err;
  } finally {
    
  }
}
