/**
 * Manual Reply Execution Handler
 *
 * Sends a user-authored reply to an interaction via browser-runner.
 * Enqueued by the API route POST /api/interactions/:id/reply after the
 * reply policy engine approves the send.
 */

import { Job } from 'bullmq';
import { createDatabaseClient, isInteractionTargetBlocked } from '@ai-growth-ops/database';
import { decryptToken } from '@ai-growth-ops/providers';
import { createLogger } from '@ai-growth-ops/observability';
import type { PlatformCode } from '@ai-growth-ops/connectors';
import { getOrCreateConnector } from '@ai-growth-ops/connectors';
import { getBrowserRunnerConfig, getBrowserRunnerHeaders, BLOCKLISTED_TARGET_ERROR_CODE } from '@ai-growth-ops/shared';
import { writeBackReplyToLead } from './reply-lead-writeback.js';

const logger = createLogger('manual-reply');

function runnerHeaders(): Record<string, string> {
  return getBrowserRunnerHeaders({ 'content-type': 'application/json' });
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

  // 黑名单强制检查（spec/47）：命中则不发送，job 以
  // BLOCKLISTED_TARGET 错误码失败（不进入下方 catch 的失败记录分支）。
  if (interaction.organizationId) {
    const blocked = await isInteractionTargetBlocked(
      db,
      interaction.organizationId,
      interaction.platform,
      interaction.externalUserId
    );
    if (blocked) {
      await db.interaction.update({
        where: { id: interactionId },
        data: { status: 'REPLY_SUGGESTED' }
      });
      const err = Object.assign(
        new Error('目标用户已在黑名单，禁止发送回复'),
        { code: BLOCKLISTED_TARGET_ERROR_CODE }
      );
      logger.warn('Manual reply blocked by blocklist', { interactionId });
      throw err;
    }
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

  // Decrypt cookie (may be absent for official_api accounts). Wrap in
  // try/catch: a corrupted/rotated encryption key must NOT crash the job
  // into an infinite retry loop — fall back to no-cookie instead.
  const cookie = account.cookieRef
    ? decryptToken(account.cookieRef)
    : undefined;
  const accessToken = account.accessTokenEncrypted
    ? (() => {
        try {
          return decryptToken(account.accessTokenEncrypted!);
        } catch (err) {
          console.error(
            '[manual-reply] accessToken decrypt failed, falling back to browser:',
            err
          );
          return undefined;
        }
      })()
    : undefined;

  try {
    let result: {
      success: boolean;
      externalReplyId?: string;
      errorMessage?: string;
      errorCode?: string;
    };

    if (accessToken) {
      // ── Official API path (stable) ────────────────────────────────
      // Force official_api mode so getOrCreateConnector instantiates the
      // official connector, not a hybrid that may fall back to browser.
      const connector = getOrCreateConnector(
        interaction.platform as PlatformCode,
        'official_api',
        { mode: 'official_api', accessToken } as never
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
        const text = (interaction.rawPayload as Record<string, unknown>)
          ?.content;
        if (typeof text === 'string') body.commentText = text;
      } else {
        body.externalUserId = interaction.externalUserId;
        body.messageText = replyContent;
        delete body.replyText;
      }

      const response = await fetch(`${getBrowserRunnerConfig().url}${endpoint}`, {
        method: 'POST',
        headers: runnerHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });

      const respBody = (await response.json()) as Record<string, unknown>;
      if (!response.ok || respBody.error) {
        throw new Error(String(respBody.error || `HTTP ${response.status}`));
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
          rawResponse: {
            mode: accessToken ? 'official_api' : 'browser_assist'
          }
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

    // 回复发送成功后回写线索（lastContactedAt/活动/状态推进，spec/53 T2）。
    // 建议 may 不存在（无 replySuggestionId），此时仅靠 interaction 反查。
    const suggestionForWriteback = replySuggestionId
      ? await db.replySuggestion
          .findUnique({
            where: { id: replySuggestionId },
            select: { leadId: true }
          })
          .catch(() => null)
      : null;
    await writeBackReplyToLead(db, {
      interactionId,
      organizationId: interaction.organizationId,
      suggestionLeadId: suggestionForWriteback?.leadId ?? null,
      replySuggestionId: replySuggestionId ?? null,
      source: 'manual_reply'
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
