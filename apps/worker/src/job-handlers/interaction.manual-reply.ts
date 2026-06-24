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
import type { PlatformCode, InteractionMode } from '@ai-growth-ops/connectors';
import { getOrCreateConnector } from '@ai-growth-ops/connectors';

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

  // Decrypt cookie (may be absent for official_api accounts)
  const cookie = account.cookieRef
    ? decryptToken(account.cookieRef)
    : undefined;
  // Official access token — when present, prefer the platform API over
  // browser automation: it's far more stable (no DOM selectors to break).
  const accessToken = account.accessTokenEncrypted
    ? decryptToken(account.accessTokenEncrypted)
    : undefined;
  const mode = (account.mode as InteractionMode) ?? 'browser_assist';

  try {
    let result: {
      success: boolean;
      externalReplyId?: string;
      errorMessage?: string;
      errorCode?: string;
    };

    if (accessToken) {
      // ── Official API path (stable) ────────────────────────────────
      const connector = getOrCreateConnector(
        interaction.platform as PlatformCode,
        mode,
        { mode, cookie, accessToken }
      );
      const isComment = interaction.type === 'comment';
      const sourceContentId = String(
        (interaction.rawPayload as Record<string, unknown>)?.sourceContentId ??
          ''
      );
      result = isComment
        ? await connector.replyComment({
            platformAccountId: account.id,
            externalCommentId: interaction.externalInteractionId,
            sourceContentId,
            replyText: replyContent
          })
        : await connector.replyMessage({
            platformAccountId: account.id,
            externalUserId: interaction.externalUserId,
            messageText: replyContent
          });
      logger.info('Reply via official API', {
        interactionId,
        success: result.success
      });
    } else {
      // ── Browser-assist fallback path ──────────────────────────────
      const isComment = interaction.type === 'comment';
      const endpoint = isComment
        ? '/assist/reply-comment'
        : '/assist/reply-message';

      const body: Record<string, string> = {
        platform: interaction.platform,
        cookie: cookie ?? '',
        replyText: replyContent
      };

      if (isComment) {
        body.externalCommentId = interaction.externalInteractionId;
        const sourceContentId = (
          interaction.rawPayload as Record<string, unknown>
        )?.sourceContentId;
        if (sourceContentId) body.sourceContentId = String(sourceContentId);
        // commentText aids locating the comment row on lazy-loaded pages.
        const text = (
          interaction.rawPayload as Record<string, unknown>
        )?.content;
        if (typeof text === 'string') body.commentText = text;
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

      const respBody = (await response.json()) as Record<string, unknown>;
      if (!response.ok || respBody.error) {
        throw new Error(
          String(respBody.error || `HTTP ${response.status}`)
        );
      }
      result = {
        success: respBody.success !== false,
        externalReplyId:
          (respBody.externalReplyId as string) || `manual-${Date.now()}`,
        errorMessage: respBody.errorMessage as string | undefined,
        errorCode: respBody.errorCode as string | undefined
      };
    }

    if (!result.success) {
      throw new Error(
        result.errorMessage || result.errorCode || 'Reply failed'
      );
    }

    // Success — update records
    if (replySuggestionId) {
      await db.replyAttempt.create({
        data: {
          replySuggestionId,
          platform: interaction.platform,
          providerMode: accessToken ? 'official_api' : 'browser_assist',
          status: 'sent',
          externalReplyId: result.externalReplyId || `manual-${Date.now()}`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rawResponse: { mode: accessToken ? 'official_api' : 'browser_assist' } as any
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
      platform: interaction.platform,
      via: accessToken ? 'official_api' : 'browser_assist'
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await db.replyAttempt
      .create({
        data: {
          replySuggestionId: replySuggestionId || '',
          platform: interaction.platform,
          providerMode: accessToken ? 'official_api' : 'browser_assist',
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
