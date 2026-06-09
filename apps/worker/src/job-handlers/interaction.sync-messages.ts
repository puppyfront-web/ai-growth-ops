import type { PlatformCode, InteractionMode } from '@ai-growth-ops/connectors';
import { getOrCreateConnector } from '@ai-growth-ops/connectors';
import { createDatabaseClient } from '@ai-growth-ops/database';
import type { DatabaseClient } from '@ai-growth-ops/database';
import { decryptToken } from '@ai-growth-ops/providers';
import type { Job } from 'bullmq';
import type { InteractionSyncMessagesInput } from '../job-types.js';
import { prepareMessagesForSync } from './interaction-sync-utils.js';
import { classifyAndSuggestReply } from './interaction-pipeline.js';
import { isTransientError } from '../worker.js';

export async function handleInteractionSyncMessages(
  job: Job<InteractionSyncMessagesInput>
): Promise<void> {
  const {
    userId,
    platformAccountId,
    platform,
    mode,
    headed,
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

    if (!account) {
      if (syncJobId) {
        await db.interactionSyncJob.update({
          where: { id: syncJobId },
          data: { status: 'failed', errorMessage: `PlatformAccount not found: ${platformAccountId}`, finishedAt: new Date() },
        });
      }
      return;
    }

    const cookie = account.cookieRef ? decryptToken(account.cookieRef) : undefined;
    const accessToken = account.accessTokenEncrypted
      ? decryptToken(account.accessTokenEncrypted)
      : undefined;

    const connector = getOrCreateConnector(
      platform as PlatformCode,
      mode as InteractionMode,
      { mode: mode as InteractionMode, cookie, accessToken, headed },
    );

    // Fetch messages from platform
    const fetchedMessages = await connector.fetchMessages({
      platformAccountId,
      cursor,
      limit: limit || 50,
      headed,
    });
    const messages = prepareMessagesForSync(fetchedMessages);

    // Process and deduplicate
    let newCount = 0;
    let skippedCount = 0;

    for (const message of messages) {
      const existing = await db.interaction.findFirst({
        where: {
          platformAccountId,
          externalInteractionId: message.externalMessageId,
        },
      });

      if (existing) {
        skippedCount++;
        continue;
      }

      // Create interaction record — catch concurrent race on unique constraint
      let interaction;
      try {
        interaction = await db.interaction.create({
          data: {
            userId,
            organizationId: account.organizationId,
            externalInteractionId: message.externalMessageId,
            platformAccountId,
            platform: platform as any,
            type: 'message',
            status: 'NEW',
            content: message.content,
            externalUserId: message.externalUserId,
            externalUserName: message.userNickname,
            rawPayload: (message.rawPayload as any) ?? undefined,
          },
        });
      } catch (err: any) {
        // Unique constraint violation — another worker beat us; treat as duplicate
        if (err?.code === 'P2002') {
          skippedCount++;
          continue;
        }
        throw err;
      }
      newCount++;

      // Inline classify + reply suggestion
      await classifyAndSuggestReply(
        db,
        interaction.id,
        message.content,
        platform,
        'message',
      );
    }

    // Update sync job as completed
    if (syncJobId) {
      await db.interactionSyncJob.update({
        where: { id: syncJobId },
        data: {
          status: 'completed',
          finishedAt: new Date(),
          fetchedCount: messages.length,
        },
      });
    }

    job.log(
      `Synced ${messages.length}/${fetchedMessages.length} messages after today-filter: ${newCount} new, ${skippedCount} duplicates`
    );
  } catch (err) {
    const transient = isTransientError(err);
    if (syncJobId) {
      await db.interactionSyncJob.update({
        where: { id: syncJobId },
        data: {
          status: transient ? 'pending' : 'failed',
          finishedAt: transient ? undefined : new Date(),
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      }).catch(() => {}); // DB may be down too
    }
    throw err;
  } finally {
    await db.$disconnect();
  }
}
