/**
 * Shared classify + reply-suggestion pipeline.
 * Inlines the AI skill calls and rule-based fallbacks directly,
 * instead of routing through separate BullMQ queues.
 *
 * Replaces the now-removed interaction.classify and interaction.suggest-reply
 * queue handlers. Called from the sync handlers after creating each Interaction row.
 */

import type { DatabaseClient } from '@ai-growth-ops/database';
import { getSharedSkillRunner } from '@ai-growth-ops/skills';
import { getQueue, QUEUE_NAMES } from '../queue.js';
import type {
  ClassificationResult,
  ReplySuggestionResult
} from './rule-classifier.js';
import {
  classifyByRules,
  generateRuleBasedReply,
  containsSensitiveContent,
  classifySensitiveWithAI
} from './rule-classifier.js';

/** Lead level order, A = hottest. Used to avoid downgrading an existing lead. */
const LEVEL_RANK: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

/** Only A/B-grade interactions auto-convert to leads (high intent). */
function shouldConvertToLead(level: string | undefined): boolean {
  return level === 'A' || level === 'B';
}

/** Valid ReplyType enum values per Prisma schema */
const VALID_REPLY_TYPES = [
  'faq_answer',
  'guide_to_private',
  'guide_to_wecom',
  'ask_more_info',
  'thanks',
  'complaint_response',
  'manual_only'
] as const;

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
  interactionType: string
): Promise<void> {
  // ── Step 1: Classify ──────────────────────────────────────────────
  let classification: ClassificationResult | null = null;

  try {
    await db.interaction.update({
      where: { id: interactionId },
      data: { status: 'CLASSIFYING' }
    });

    const runner = getSharedSkillRunner();
    const result = await runner.run({
      skillName: 'lead-classification',
      input: { platform, interactionType, content }
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

  // Write classification to DB (protected — failure should not abort the batch)
  try {
    await db.interactionClassification.upsert({
      where: { interactionId },
      create: {
        interactionId,
        intent: classification.intent || 'unknown',
        leadLevel: classification.leadLevel || 'C',
        confidence: classification.confidence ?? 0.5,
        riskLevel: classification.riskLevel || 'low',
        summary: classification.summary || '',
        tags: classification.tags || [],
        nextAction: classification.nextAction || ''
      },
      update: {
        intent: classification.intent || 'unknown',
        leadLevel: classification.leadLevel || 'C',
        confidence: classification.confidence ?? 0.5,
        riskLevel: classification.riskLevel || 'low',
        summary: classification.summary || '',
        tags: classification.tags || [],
        nextAction: classification.nextAction || ''
      }
    });

    await db.interaction.update({
      where: { id: interactionId },
      data: { status: 'CLASSIFIED' }
    });
  } catch (error) {
    console.error('[pipeline] Classification DB write failed:', error);
    return;
  }

  // ── Step 2.5: Auto-convert high-intent interactions to leads ──────────
  // A/B-grade comments/messages are the product's customer-acquisition entry
  // point. C/D are ignored to keep the lead pool signal-heavy. This runs
  // independently of reply suggestion (an interaction may convert to a lead
  // even when no auto-reply is sent).
  if (shouldConvertToLead(classification.leadLevel)) {
    await convertInteractionToLead(db, interactionId, classification).catch(
      (err) =>
        console.error('[pipeline] Lead auto-conversion failed:', err)
    );
  }

  // ── Step 2: Suggest reply (skip for D-level / spam) ───────────────
  if (classification.leadLevel === 'D') {
    return;
  }

  try {
    let reply: ReplySuggestionResult | null = null;

    try {
      const runner = getSharedSkillRunner();
      const result = await runner.run<
        Record<string, unknown>,
        Record<string, unknown>
      >({
        skillName: 'reply-suggestion',
        input: {
          interaction: { content, platform, type: interactionType },
          classification,
          platform,
          brandTone: '专业、克制、不过度承诺'
        }
      });

      if (result.status === 'success' && result.output) {
        const output = result.output;
        reply = {
          suggestedText: String(output.suggestedText || ''),
          replyType: String(output.replyType || 'faq_answer'),
          riskLevel: (['low', 'medium', 'high'].includes(
            String(output.riskLevel)
          )
            ? output.riskLevel
            : 'low') as ReplySuggestionResult['riskLevel'],
          needReview: Boolean(output.needReview),
          reason: output.reason ? String(output.reason) : undefined
        };
      }
    } catch (error) {
      console.error(
        '[pipeline] AI reply suggestion failed, using rules:',
        error
      );
    }

    if (!reply) {
      reply = generateRuleBasedReply(content, classification, platform);
    }

    // Apply sensitive content policy. Regex catches literal contact patterns
    // instantly; on a regex miss, run an LLM semantic check for evasions
    // (homophones, soft引流). LLM failure degrades gracefully to no-flag.
    if (containsSensitiveContent(reply.suggestedText)) {
      reply.needReview = true;
      reply.reason = 'Contains sensitive content (phone/URL/email)';
    } else {
      const aiCheck = await classifySensitiveWithAI(reply.suggestedText);
      if (aiCheck.sensitive) {
        reply.needReview = true;
        reply.reason = aiCheck.reason ?? 'AI 审核标记为潜在敏感内容';
      }
    }

    // Determine if review is needed
    const needReview =
      reply.needReview ||
      classification.riskLevel === 'high' ||
      classification.leadLevel === 'A';

    // Write reply suggestion to DB
    const replyType = (VALID_REPLY_TYPES as readonly string[]).includes(
      reply.replyType
    )
      ? reply.replyType
      : 'faq_answer';
    await db.replySuggestion.create({
      data: {
        interactionId,
        suggestedText: reply.suggestedText,
        replyType: replyType as
          | 'faq_answer'
          | 'guide_to_private'
          | 'guide_to_wecom'
          | 'ask_more_info'
          | 'thanks'
          | 'complaint_response'
          | 'manual_only',
        riskLevel: classification.riskLevel,
        needReview,
        decision: needReview ? 'require_human_review' : 'auto_send_allowed',
        decisionReason: needReview
          ? 'Requires human review due to policy rules'
          : 'Low risk, auto-send allowed',
        status: needReview ? 'waiting_review' : 'draft'
      }
    });

    await db.interaction.update({
      where: { id: interactionId },
      data: { status: 'REPLY_SUGGESTED' }
    });

    // Step 3: Check auto-reply eligibility and enqueue if eligible
    if (!needReview) {
      await enqueueAutoReplyIfEligible(db, interactionId, platform);
    }
  } catch (error) {
    // Reply suggestion failure should not block classification
    console.error('[pipeline] Reply suggestion failed:', error);
  }
}

/**
 * Check if this interaction is eligible for auto-reply and enqueue if so.
 * Loads auto-reply config from AppConfig, checks all safety guardrails.
 */
async function enqueueAutoReplyIfEligible(
  db: import('@ai-growth-ops/database').DatabaseClient,
  interactionId: string,
  _platform: string
): Promise<void> {
  try {
    // Load auto-reply config — find the user's org setting
    const interaction = await db.interaction.findUnique({
      where: { id: interactionId },
      select: { userId: true, organizationId: true }
    });
    if (!interaction) return;

    const configRecord = await db.appConfig.findFirst({
      where: {
        organizationId: interaction.organizationId,
        key: 'auto_reply_config'
      }
    });

    // Default config: disabled
    const config = (configRecord?.value as Record<string, unknown>) || {
      enabled: false
    };

    if (!config.enabled) return;

    // Check daily limit
    const maxDaily = (config.maxDailyAutoReplies as number) || 50;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todaySent = await db.replySuggestion.count({
      where: { status: 'sent', sentAt: { gte: todayStart } }
    });
    if (todaySent >= maxDaily) return;

    // Check quiet hours
    const now = new Date();
    const hour = now.getHours();
    const quietStart = parseInt(
      String(config.quietHoursStart || '22:00').split(':')[0]
    );
    const quietEnd = parseInt(
      String(config.quietHoursEnd || '08:00').split(':')[0]
    );
    if (
      quietStart > quietEnd
        ? hour >= quietStart || hour < quietEnd
        : hour >= quietStart && hour < quietEnd
    ) {
      return;
    }

    // Load the latest suggestion for this interaction
    const suggestion = await db.replySuggestion.findFirst({
      where: { interactionId, decision: 'auto_send_allowed', status: 'draft' },
      orderBy: { createdAt: 'desc' }
    });
    if (!suggestion) return;

    // Check allowed reply types
    const allowedTypes = (config.allowedReplyTypes as string[]) || [
      'thanks',
      'faq_answer',
      'ask_more_info'
    ];
    if (!allowedTypes.includes(suggestion.replyType as string)) return;

    // Check lead level review requirement
    const classification = await db.interactionClassification.findUnique({
      where: { interactionId }
    });
    if (classification) {
      const reviewLevels = (config.requireReviewForLevel as string[]) || ['A'];
      if (reviewLevels.includes(classification.leadLevel)) return;
    }

    // All checks passed — enqueue auto-reply
    const { getQueue, QUEUE_NAMES } = await import('../queue.js');
    const queue = getQueue(QUEUE_NAMES.INTERACTION_AUTO_REPLY);
    await queue.add(
      QUEUE_NAMES.INTERACTION_AUTO_REPLY,
      {
        interactionId,
        replySuggestionId: suggestion.id
      },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 }
      }
    );

    // Mark suggestion as approved (about to be sent)
    await db.replySuggestion.update({
      where: { id: suggestion.id },
      data: { status: 'waiting_review' } // Will be set to 'sent' by auto-reply handler
    });

    console.log(
      `[pipeline] Auto-reply enqueued for interaction ${interactionId}`
    );
  } catch (err) {
    console.error('[pipeline] Auto-reply eligibility check failed:', err);
  }
}

/**
 * Convert a high-intent Interaction into a Lead.
 *
 * Upserts on (sourcePlatform, sourceAccountId, externalUserId) so the same
 * commenter only ever has one lead. Existing leads are upgraded (never
 * downgraded): a later B-grade comment won't weaken an existing A-grade lead.
 * On a freshly-created lead we: record a LeadActivity, push an in-app
 * notification, and enqueue sync to any enabled external sink (Feishu/WeCom).
 */
async function convertInteractionToLead(
  db: DatabaseClient,
  interactionId: string,
  classification: ClassificationResult
): Promise<void> {
  const interaction = await db.interaction.findUnique({
    where: { id: interactionId },
    select: {
      userId: true,
      organizationId: true,
      platform: true,
      platformAccountId: true,
      externalUserId: true,
      externalUserName: true,
      publishJobId: true
    }
  });
  if (!interaction) return;

  // Guard: the unique key (sourcePlatform, sourceAccountId, externalUserId)
  // requires all three to be non-null. Interactions missing these (e.g.
  // malformed imports) cannot be deduped and would crash the upsert.
  if (!interaction.platformAccountId || !interaction.externalUserId) {
    console.warn(
      '[pipeline] Interaction missing platformAccountId/externalUserId, skip lead conversion:',
      interactionId
    );
    return;
  }

  const newLevel = (classification.leadLevel || 'C') as 'A' | 'B' | 'C' | 'D';

  // Peek at any existing lead to honour "upgrade only".
  const existing = await db.lead.findUnique({
    where: {
      sourcePlatform_sourceAccountId_externalUserId: {
        sourcePlatform: interaction.platform,
        sourceAccountId: interaction.platformAccountId,
        externalUserId: interaction.externalUserId
      }
    },
    select: { id: true, level: true }
  });

  const shouldUpdateLevel =
    !existing ||
    (LEVEL_RANK[newLevel] ?? 99) < (LEVEL_RANK[existing.level] ?? 99);

  const lead = await db.lead.upsert({
    where: {
      sourcePlatform_sourceAccountId_externalUserId: {
        sourcePlatform: interaction.platform,
        sourceAccountId: interaction.platformAccountId,
        externalUserId: interaction.externalUserId
      }
    },
    create: {
      userId: interaction.userId,
      organizationId: interaction.organizationId,
      sourcePlatform: interaction.platform,
      sourceAccountId: interaction.platformAccountId,
      sourceInteractionId: interactionId,
      sourcePublishJobId: interaction.publishJobId,
      externalUserId: interaction.externalUserId,
      externalUserName: interaction.externalUserName,
      level: newLevel,
      status: 'NEW',
      intent: classification.intent || null,
      confidence: classification.confidence ?? null,
      summary: classification.summary || null,
      tags: classification.tags ?? undefined,
      nextAction: classification.nextAction || null,
      riskLevel: classification.riskLevel || 'low'
    },
    update: shouldUpdateLevel
      ? {
          level: newLevel,
          intent: classification.intent || undefined,
          confidence: classification.confidence ?? undefined,
          summary: classification.summary || undefined,
          nextAction: classification.nextAction || undefined
        }
      : { summary: classification.summary || undefined }
  });

  // Only fan out (activity / notify / sync) for freshly-created leads.
  if (existing) {
    console.log(
      `[pipeline] Lead ${lead.id} already exists, level ${shouldUpdateLevel ? 'upgraded' : 'kept'}`
    );
    return;
  }

  await db.leadActivity.create({
    data: {
      leadId: lead.id,
      action: 'created_from_interaction',
      note: `AI 自动转化(${newLevel}级) · ${classification.intent || ''}`,
      operator: 'system',
      metadata: { interactionId, confidence: classification.confidence }
    }
  });

  // In-app notification (worker cannot import the API's notification-service,
  // so write the row directly — mirrors publishDailyReport's pattern).
  await db.notification
    .create({
      data: {
        type: 'lead',
        title: '新线索',
        content: `收到 ${newLevel} 级线索: ${interaction.externalUserName || interaction.externalUserId} · ${classification.intent || ''}`,
        level: newLevel === 'A' ? 'warning' : 'info',
        userId: interaction.userId,
        organizationId: interaction.organizationId,
        actionUrl: `/leads/${lead.id}`
      }
    } as never)
    .catch(() => {
      /* notification write is best-effort */
    });

  // Enqueue sync to any enabled external sink (Feishu bitable / WeCom).
  await enqueueLeadSinkSync(db, lead.id, interaction.organizationId).catch(
    (err) => console.error('[pipeline] Lead sink enqueue failed:', err)
  );

  console.log(
    `[pipeline] Lead ${lead.id} created (${newLevel}) from interaction ${interactionId}`
  );
}

/**
 * If the org has any enabled lead-sink config, enqueue the corresponding sync
 * job so the freshly-created lead is pushed to Feishu/WeCom. Activates the
 * previously-orphaned LEAD_SYNC_FEISHU / LEAD_SYNC_WECOM queues.
 */
async function enqueueLeadSinkSync(
  db: DatabaseClient,
  leadId: string,
  organizationId: string | null
): Promise<void> {
  if (!organizationId) return;
  const configs = await db.leadSinkConfig.findMany({
    where: { organizationId, enabled: true },
    select: { sinkType: true }
  });
  for (const cfg of configs) {
    // Normalise sinkType aliases to the value the sync handlers actually
    // query for (feishu handler reads 'lark', wecom reads 'wecom'). Without
    // this, a config saved as 'feishu_bitable'/'wecom_contact' would enqueue
    // a job whose handler then finds no matching config and throws.
    const normalized = cfg.sinkType.replace(/_bitable$|_contact$/, '').replace(
      /^feishu$/,
      'lark'
    );
    if (normalized === 'lark') {
      await getQueue(QUEUE_NAMES.LEAD_SYNC_FEISHU).add(
        QUEUE_NAMES.LEAD_SYNC_FEISHU,
        { leadId },
        { jobId: `lead-sync-feishu-${leadId}` }
      );
    } else if (normalized === 'wecom') {
      await getQueue(QUEUE_NAMES.LEAD_SYNC_WECOM).add(
        QUEUE_NAMES.LEAD_SYNC_WECOM,
        { leadId },
        { jobId: `lead-sync-wecom-${leadId}` }
      );
    }
  }
}
