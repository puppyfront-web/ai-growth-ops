/**
 * Auto-Reply Execution Handler
 *
 * Sends an auto-approved reply to an interaction via browser-runner.
 * Only low-risk, non-sensitive replies that pass the auto-reply policy are enqueued here.
 */

import { Job } from 'bullmq';
import { createDatabaseClient, isInteractionTargetBlocked } from '@ai-growth-ops/database';
import { decryptToken } from '@ai-growth-ops/providers';
import { createLogger } from '@ai-growth-ops/observability';
import { getBrowserRunnerConfig, getBrowserRunnerHeaders, isPlatformAuthExpiredError, BLOCKLISTED_TARGET_ERROR_CODE } from '@ai-growth-ops/shared';
import { writeBackReplyToLead } from './reply-lead-writeback.js';

const logger = createLogger('auto-reply');

function runnerHeaders(): Record<string, string> {
  return getBrowserRunnerHeaders({ 'content-type': 'application/json' });
}

interface AutoReplyJobData {
  interactionId: string;
  replySuggestionId: string;
}

export async function handleInteractionAutoReply(
  job: Job<AutoReplyJobData>
): Promise<void> {
  const { interactionId, replySuggestionId } = job.data;
  const db = createDatabaseClient();

  // Load interaction with reply suggestion and platform account
  const interaction = await db.interaction.findUnique({
    where: { id: interactionId },
    include: {
      replySuggestions: { where: { id: replySuggestionId } },
      platformAccount: true
    }
  });

  if (!interaction) {
    logger.error('Interaction not found', { interactionId });
    return;
  }

  const suggestion = interaction.replySuggestions[0];
  if (!suggestion) {
    logger.error('Reply suggestion not found', { replySuggestionId });
    return;
  }

  // Verify it's still auto-sendable
  if (suggestion.status !== 'draft' && suggestion.status !== 'waiting_review') {
    logger.info('Reply suggestion no longer eligible', {
      status: suggestion.status
    });
    return;
  }

  const account = interaction.platformAccount;
  if (!account?.cookieRef) {
    logger.error('No cookie available for account');
    await db.replySuggestion.update({
      where: { id: suggestion.id },
      data: { status: 'failed' }
    });
    return;
  }

  // 黑名单强制检查（spec/47）：命中则不发送、不消耗配额，job 以
  // BLOCKLISTED_TARGET 错误码失败。
  if (interaction.organizationId) {
    const blocked = await isInteractionTargetBlocked(
      db,
      interaction.organizationId,
      interaction.platform,
      interaction.externalUserId
    );
    if (blocked) {
      await db.replySuggestion.update({
        where: { id: suggestion.id },
        data: {
          status: 'rejected',
          decision: 'rejected',
          decisionReason: 'blocklisted'
        }
      });
      const err = Object.assign(
        new Error('目标用户已在黑名单，禁止自动回复'),
        { code: BLOCKLISTED_TARGET_ERROR_CODE }
      );
      logger.warn('Auto-reply blocked by blocklist', { interactionId });
      throw err;
    }
  }

  // Decrypt cookie
  const cookie = decryptToken(account.cookieRef);

  try {
    // Determine reply endpoint based on interaction type
    const isComment = interaction.type === 'comment';
    const endpoint = isComment
      ? '/assist/reply-comment'
      : '/assist/reply-message';

    const response = await fetch(`${getBrowserRunnerConfig().url}${endpoint}`, {
      method: 'POST',
      headers: runnerHeaders(),
      body: JSON.stringify({
        platform: interaction.platform,
        cookie,
        externalCommentId: interaction.externalInteractionId,
        externalUserId: interaction.externalUserId,
        replyText: suggestion.suggestedText,
        sourceContentId: (interaction.rawPayload as Record<string, unknown>)
          ?.sourceContentId
      }),
      signal: AbortSignal.timeout(30000)
    });

    const result = (await response.json()) as Record<string, unknown>;

    if (!response.ok || result.error) {
      throw new Error(String(result.error || `HTTP ${response.status}`));
    }

    // Success — update records
    await db.replyAttempt.create({
      data: {
        replySuggestionId: suggestion.id,
        platform: interaction.platform,
        providerMode: 'browser_assist',
        status: 'sent',
        externalReplyId: (result.replyId as string) || `auto-${Date.now()}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rawResponse: result as any
      }
    });

    await db.replySuggestion.update({
      where: { id: suggestion.id },
      data: { status: 'sent', sentAt: new Date() }
    });

    await db.interaction.update({
      where: { id: interactionId },
      data: { status: 'REPLIED' }
    });

    // 回复发送成功后回写线索（lastContactedAt/活动/状态推进，spec/53 T2）
    await writeBackReplyToLead(db, {
      interactionId,
      organizationId: interaction.organizationId,
      suggestionLeadId: suggestion.leadId,
      replySuggestionId: suggestion.id,
      source: 'auto_reply'
    });

    logger.info('Auto-reply sent', {
      interactionId,
      platform: interaction.platform
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // 平台登录态失效 → 标记账号 expired，前端会直接引导用户重新扫码授权
    if (isPlatformAuthExpiredError(err) && account) {
      await db.platformAccount
        .update({ where: { id: account.id }, data: { status: 'expired' } })
        .catch(() => {});
    }

    await db.replyAttempt.create({
      data: {
        replySuggestionId: suggestion.id,
        platform: interaction.platform,
        providerMode: 'browser_assist',
        status: 'failed',
        errorMessage
      }
    });

    await db.replySuggestion.update({
      where: { id: suggestion.id },
      data: { status: 'failed' }
    });

    logger.error('Auto-reply failed', { interactionId, error: errorMessage });
    throw err;
  }
}
