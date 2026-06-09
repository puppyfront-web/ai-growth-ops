/**
 * Manual Reply Execution Handler
 *
 * Sends a user-authored reply to an interaction via browser-runner.
 * Enqueued by the API route POST /api/interactions/:id/reply after the
 * reply policy engine approves the send.
 */

import { Job } from 'bullmq';
import { createDatabaseClient } from '@ai-growth-ops/database';
import { decryptToken } from '@ai-growth-ops/providers';
import { createLogger } from '@ai-growth-ops/observability';

const logger = createLogger('manual-reply');

const BROWSER_RUNNER_URL =
  process.env.BROWSER_RUNNER_URL || 'http://localhost:3200';
const RUNNER_SECRET =
  process.env.BROWSER_RUNNER_SECRET || process.env.TOKEN_ENCRYPTION_KEY || '';

function runnerHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (RUNNER_SECRET) h['authorization'] = `Bearer ${RUNNER_SECRET}`;
  return h;
}

interface ManualReplyJobData {
  interactionId: string;
  replyContent: string;
  replySuggestionId?: string;
}

export async function handleInteractionManualReply(
  job: Job<ManualReplyJobData>
): Promise<void> {
  const { interactionId, replyContent, replySuggestionId } = job.data;
  const db = createDatabaseClient();

  // Load interaction with platform account
  const interaction = await db.interaction.findUnique({
    where: { id: interactionId },
    include: { platformAccount: true }
  });

  if (!interaction) {
    logger.error('Interaction not found', { interactionId });
    return;
  }

  const account = interaction.platformAccount;
  if (!account?.cookieRef) {
    logger.error('No cookie available for account', { interactionId });
    await db.interaction.update({
      where: { id: interactionId },
      data: { status: 'REPLY_SUGGESTED' }
    });
    return;
  }

  // Decrypt cookie
  const cookie = decryptToken(account.cookieRef);

  try {
    // Determine reply endpoint based on interaction type
    const isComment = interaction.type === 'comment';
    const endpoint = isComment
      ? '/assist/reply-comment'
      : '/assist/reply-message';

    // Build request body with correct field names for browser-runner
    const body: Record<string, string> = {
      platform: interaction.platform,
      cookie,
      replyText: replyContent
    };

    if (isComment) {
      body.externalCommentId = interaction.externalInteractionId;
      const sourceContentId = (
        interaction.rawPayload as Record<string, unknown>
      )?.sourceContentId;
      if (sourceContentId) body.sourceContentId = String(sourceContentId);
    } else {
      body.externalUserId = interaction.externalUserId;
      body.messageText = replyContent;
      delete body.replyText;
    }

    const response = await fetch(`${BROWSER_RUNNER_URL}${endpoint}`, {
      method: 'POST',
      headers: runnerHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });

    const result = (await response.json()) as Record<string, unknown>;

    if (!response.ok || result.error) {
      throw new Error(String(result.error || `HTTP ${response.status}`));
    }

    // Success — update records
    // Only create ReplyAttempt if we have a valid replySuggestionId (FK constraint)
    if (replySuggestionId) {
      await db.replyAttempt.create({
        data: {
          replySuggestionId,
          platform: interaction.platform,
          providerMode: 'browser_assist',
          status: 'sent',
          externalReplyId:
            (result.externalReplyId as string) || `manual-${Date.now()}`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rawResponse: result as any
        }
      });

      await db.replySuggestion
        .update({
          where: { id: replySuggestionId },
          data: { status: 'sent', sentAt: new Date() }
        })
        .catch(() => {
          /* suggestion may not exist */
        });
    }

    await db.interaction.update({
      where: { id: interactionId },
      data: { status: 'REPLIED' }
    });

    logger.info('Manual reply sent', {
      interactionId,
      platform: interaction.platform
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await db.replyAttempt
      .create({
        data: {
          replySuggestionId: replySuggestionId || '',
          platform: interaction.platform,
          providerMode: 'browser_assist',
          status: 'failed',
          errorMessage
        }
      })
      .catch(() => {
        /* best effort — FK may fail if no suggestionId */
      });

    await db.interaction.update({
      where: { id: interactionId },
      data: { status: 'REPLY_SUGGESTED' }
    });

    logger.error('Manual reply failed', { interactionId, error: errorMessage });
    throw err; // re-throw to trigger BullMQ retry
  }
}
