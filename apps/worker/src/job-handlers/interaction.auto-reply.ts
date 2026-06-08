/**
 * Auto-Reply Execution Handler
 *
 * Sends an auto-approved reply to an interaction via browser-runner.
 * Only low-risk, non-sensitive replies that pass the auto-reply policy are enqueued here.
 */

import { Job } from 'bullmq';
import { createDatabaseClient } from '@ai-growth-ops/database';
import { decryptToken } from '@ai-growth-ops/providers';
import { createLogger } from '@ai-growth-ops/observability';

const logger = createLogger('auto-reply');

const BROWSER_RUNNER_URL = process.env.BROWSER_RUNNER_URL || 'http://localhost:3200';

interface AutoReplyJobData {
  interactionId: string;
  replySuggestionId: string;
}

export async function handleInteractionAutoReply(job: Job<AutoReplyJobData>): Promise<void> {
  const { interactionId, replySuggestionId } = job.data;
  const db = createDatabaseClient();

  // Load interaction with reply suggestion and platform account
  const interaction = await db.interaction.findUnique({
    where: { id: interactionId },
    include: {
      replySuggestions: { where: { id: replySuggestionId } },
      platformAccount: true,
    },
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
    logger.info('Reply suggestion no longer eligible', { status: suggestion.status });
    return;
  }

  const account = interaction.platformAccount;
  if (!account?.cookieRef) {
    logger.error('No cookie available for account');
    await db.replySuggestion.update({
      where: { id: suggestion.id },
      data: { status: 'failed' },
    });
    return;
  }

  // Decrypt cookie
  const cookie = decryptToken(account.cookieRef);

  try {
    // Determine reply endpoint based on interaction type
    const isComment = interaction.type === 'comment';
    const endpoint = isComment ? '/assist/reply-comment' : '/assist/reply-message';

    const response = await fetch(`${BROWSER_RUNNER_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: interaction.platform,
        cookie,
        interactionId: interaction.externalInteractionId,
        externalUserId: interaction.externalUserId,
        replyText: suggestion.suggestedText,
        contentId: (interaction.rawPayload as any)?.sourceContentId,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const result = await response.json() as Record<string, unknown>;

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
        rawResponse: result as any,
      },
    });

    await db.replySuggestion.update({
      where: { id: suggestion.id },
      data: { status: 'sent', sentAt: new Date() },
    });

    await db.interaction.update({
      where: { id: interactionId },
      data: { status: 'REPLIED' },
    });

    logger.info('Auto-reply sent', { interactionId, platform: interaction.platform });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await db.replyAttempt.create({
      data: {
        replySuggestionId: suggestion.id,
        platform: interaction.platform,
        providerMode: 'browser_assist',
        status: 'failed',
        errorMessage,
      },
    });

    await db.replySuggestion.update({
      where: { id: suggestion.id },
      data: { status: 'failed' },
    });

    logger.error('Auto-reply failed', { interactionId, error: errorMessage });
    throw err;
  }
}
