/**
 * Shared classify + reply-suggestion pipeline.
 * Inlines the AI skill calls and rule-based fallbacks directly,
 * instead of routing through separate BullMQ queues.
 *
 * Replaces the now-removed interaction.classify and interaction.suggest-reply
 * queue handlers. Called from the sync handlers after creating each Interaction row.
 */

import type { DatabaseClient } from '@ai-growth-ops/database';
import { DefaultSkillRunner } from '@ai-growth-ops/skills';
import type { ClassificationResult, ReplySuggestionResult } from './rule-classifier.js';
import { classifyByRules, generateRuleBasedReply, containsSensitiveContent } from './rule-classifier.js';

let _skillRunner: DefaultSkillRunner | null = null;
function getSkillRunner(): DefaultSkillRunner {
  if (!_skillRunner) _skillRunner = new DefaultSkillRunner();
  return _skillRunner;
}

/**
 * Classify an interaction and optionally generate a reply suggestion.
 * Writes results to DB. Never throws — errors are logged and the
 * interaction status is still updated.
 */
export async function classifyAndSuggestReply(
  db: DatabaseClient,
  interactionId: string,
  content: string,
  platform: string,
  interactionType: string,
): Promise<void> {
  // ── Step 1: Classify ──────────────────────────────────────────────
  let classification: ClassificationResult | null = null;

  try {
    await db.interaction.update({
      where: { id: interactionId },
      data: { status: 'CLASSIFYING' },
    });

    const runner = getSkillRunner();
    const result = await runner.run({
      skillName: 'lead-classification',
      input: { platform, interactionType, content },
    });

    if (result.status === 'success' && result.output) {
      classification = result.output as ClassificationResult;
    }
  } catch (error) {
    console.error('[pipeline] AI classification failed, using rules:', error);
  }

  if (!classification) {
    classification = classifyByRules(content);
  }

  // Write classification to DB
  await db.interactionClassification.upsert({
    where: { interactionId },
    create: {
      interactionId,
      intent: classification.intent || 'unknown',
      leadLevel: classification.leadLevel || 'C',
      confidence: classification.confidence ?? 0.5,
      riskLevel: classification.riskLevel || 'low',
      summary: classification.summary || '',
      tags: (classification.tags as any) || [],
      nextAction: classification.nextAction || '',
    },
    update: {
      intent: classification.intent || 'unknown',
      leadLevel: classification.leadLevel || 'C',
      confidence: classification.confidence ?? 0.5,
      riskLevel: classification.riskLevel || 'low',
      summary: classification.summary || '',
      tags: (classification.tags as any) || [],
      nextAction: classification.nextAction || '',
    },
  });

  await db.interaction.update({
    where: { id: interactionId },
    data: { status: 'CLASSIFIED' },
  });

  // ── Step 2: Suggest reply (skip for D-level / spam) ───────────────
  if (classification.leadLevel === 'D') {
    return;
  }

  try {
    let reply: ReplySuggestionResult | null = null;

    try {
      const runner = getSkillRunner();
      const result = await runner.run<Record<string, unknown>, Record<string, unknown>>({
        skillName: 'reply-suggestion',
        input: {
          interaction: { content, platform, type: interactionType },
          classification,
          platform,
          brandTone: '专业、克制、不过度承诺',
        },
      });

      if (result.status === 'success' && result.output) {
        const output = result.output;
        reply = {
          suggestedText: String(output.suggestedText || ''),
          replyType: String(output.replyType || 'faq_answer'),
          riskLevel: (['low', 'medium', 'high'].includes(String(output.riskLevel))
            ? output.riskLevel
            : 'low') as ReplySuggestionResult['riskLevel'],
          needReview: Boolean(output.needReview),
          reason: output.reason ? String(output.reason) : undefined,
        };
      }
    } catch (error) {
      console.error('[pipeline] AI reply suggestion failed, using rules:', error);
    }

    if (!reply) {
      reply = generateRuleBasedReply(content, classification, platform);
    }

    // Apply sensitive content policy
    if (containsSensitiveContent(reply.suggestedText)) {
      reply.needReview = true;
      reply.reason = 'Contains sensitive content (phone/URL/email)';
    }

    // Determine if review is needed
    const needReview =
      reply.needReview ||
      classification.riskLevel === 'high' ||
      classification.leadLevel === 'A';

    // Write reply suggestion to DB
    await db.replySuggestion.create({
      data: {
        interactionId,
        suggestedText: reply.suggestedText,
        replyType: reply.replyType as any,
        riskLevel: classification.riskLevel,
        needReview,
        decision: needReview ? 'require_human_review' : 'auto_send_allowed',
        decisionReason: needReview
          ? 'Requires human review due to policy rules'
          : 'Low risk, auto-send allowed',
        status: needReview ? 'waiting_review' : 'draft',
      },
    });

    await db.interaction.update({
      where: { id: interactionId },
      data: { status: 'REPLY_SUGGESTED' },
    });
  } catch (error) {
    // Reply suggestion failure should not block classification
    console.error('[pipeline] Reply suggestion failed:', error);
  }
}
