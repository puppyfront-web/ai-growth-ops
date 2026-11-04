/**
 * Shared classify + reply-suggestion pipeline.
 * Inlines the AI skill calls and rule-based fallbacks directly,
 * instead of routing through separate BullMQ queues.
 *
 * Replaces the now-removed interaction.classify and interaction.suggest-reply
 * queue handlers. Called from the sync handlers after creating each Interaction row.
 */

import {
  applyAssignmentRules,
  blockInteractionTarget,
  ensureCustomerFromInteraction,
  isInteractionTargetBlocked,
  recordLeadConversionForPublishJob,
  trySyncCustomerToFeishu,
  type DatabaseClient
} from '@ai-growth-ops/database';
import { draftReply, getSharedSkillRunner } from '@ai-growth-ops/skills';
import {
  buildReplyDraftContext,
  defaultNextActionAt,
  detectUnsubscribeIntent,
  REPLY_DRAFT_MAX_HISTORY_ITEMS,
  type ReplyDraftContext
} from '@ai-growth-ops/shared';
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
 * 黑名单/退订守卫（spec/47 G1）：
 * 1. 私信文本命中退订意图 → 自动加入黑名单（reason=unsubscribe）并写 AuditLog；
 * 2. 命中黑名单 → Interaction metadata.blocklisted=true，跳过分类/建议，
 *    已存在的 waiting_review 建议置为 rejected(reason=blocklisted)。
 * 返回 true 表示目标被拉黑，调用方应跳过后续分类/建议。
 */
export async function applyInteractionBlocklistGuard(
  db: DatabaseClient,
  input: {
    interactionId: string;
    content: string;
    platform: string;
    interactionType: string;
  }
): Promise<boolean> {
  const interaction = await db.interaction.findUnique({
    where: { id: input.interactionId },
    select: {
      organizationId: true,
      userId: true,
      platform: true,
      externalUserId: true,
      type: true
    }
  });
  if (!interaction?.organizationId || !interaction.externalUserId) return false;

  // 私信中表达明确退订意图 → 自动拉黑（幂等，已拉黑不重复建）
  if (
    (interaction.type === 'message' || interaction.type === 'official_message') &&
    input.interactionType !== 'comment' &&
    detectUnsubscribeIntent(input.content)
  ) {
    const result = await blockInteractionTarget(db, {
      organizationId: interaction.organizationId,
      platform: interaction.platform,
      platformUserId: interaction.externalUserId,
      reason: 'unsubscribe',
      metadata: { interactionId: input.interactionId }
    });
    if (result.created) {
      await db.auditLog
        .create({
          data: {
            organizationId: interaction.organizationId,
            userId: interaction.userId,
            action: 'create',
            entity: 'interaction_blocklist',
            entityId: result.record.id,
            changes: {
              after: {
                reason: 'unsubscribe',
                platform: interaction.platform,
                platformUserId: interaction.externalUserId,
                triggerInteractionId: input.interactionId
              }
            } as never
          }
        })
        .catch(() => {
          /* auditLog 写入失败不阻断 */
        });
    }
  }

  const blocked = await isInteractionTargetBlocked(
    db,
    interaction.organizationId,
    interaction.platform,
    interaction.externalUserId
  );
  if (!blocked) return false;

  // 标记并跳过：合并 metadata，避免覆盖已有键
  const existing = await db.interaction.findUnique({
    where: { id: input.interactionId },
    select: { metadata: true }
  });
  const mergedMetadata = {
    ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
    blocklisted: true
  };
  await db.interaction.update({
    where: { id: input.interactionId },
    data: {
      status: 'IGNORED',
      metadata: mergedMetadata as never
    }
  });

  // 已有待审建议 → 置为 rejected
  await db.replySuggestion.updateMany({
    where: { interactionId: input.interactionId, status: 'waiting_review' },
    data: {
      status: 'rejected',
      decision: 'rejected',
      decisionReason: 'blocklisted'
    }
  });

  console.log(
    `[pipeline] Interaction ${input.interactionId} blocklisted, skip classify/suggest`
  );
  return true;
}

/**
 * 组装 reply-draft skill 的完整上下文（spec/47 G2）：
 * 画像来自同平台同外部用户的最新的 Lead，历史取最近
 * REPLY_DRAFT_MAX_HISTORY_ITEMS 条互动，话术来自 AppConfig `reply_style_config`。
 * 任何数据缺失都归一化为 null，组装失败返回 null（调用方走回退链路）。
 */
export async function buildReplyDraftPipelineContext(
  db: DatabaseClient,
  input: {
    interactionId: string;
    content: string;
    platform: string;
    interactionType: string;
  }
): Promise<ReplyDraftContext | null> {
  try {
    const interaction = await db.interaction.findUnique({
      where: { id: input.interactionId },
      select: {
        platform: true,
        externalUserId: true,
        type: true,
        content: true,
        organizationId: true,
        userId: true
      }
    });
    if (!interaction) return null;

    const [lead, historyRows, styleRecord] = await Promise.all([
      interaction.externalUserId
        ? db.lead.findFirst({
            where: {
              organizationId: interaction.organizationId,
              sourcePlatform: interaction.platform,
              externalUserId: interaction.externalUserId
            },
            orderBy: { updatedAt: 'desc' },
            select: { level: true, intent: true, summary: true }
          })
        : null,
      interaction.externalUserId
        ? db.interaction.findMany({
            where: {
              organizationId: interaction.organizationId,
              platform: interaction.platform,
              externalUserId: interaction.externalUserId,
              id: { not: input.interactionId }
            },
            orderBy: { createdAt: 'desc' },
            take: REPLY_DRAFT_MAX_HISTORY_ITEMS,
            select: { content: true, createdAt: true }
          })
        : [],
      db.appConfig.findFirst({
        where: {
          organizationId: interaction.organizationId,
          key: 'reply_style_config'
        },
        select: { value: true }
      })
    ]);

    const styleValue = (styleRecord?.value ?? null) as Record<
      string,
      unknown
    > | null;

    return buildReplyDraftContext(
      {
        platform: interaction.platform,
        interactionType: input.interactionType,
        content: input.content || interaction.content || ''
      },
      lead
        ? {
            summary: lead.summary,
            leadLevel: lead.level,
            intent: lead.intent
          }
        : null,
      // shared 契约：历史升序（旧→新）传入，由纯函数保留最近 N 条
      historyRows.length > 0
        ? historyRows
            .map((row) => ({
              content: row.content,
              occurredAt: row.createdAt?.toISOString() ?? null
            }))
            .reverse()
        : null,
      styleValue
        ? {
            tone: (styleValue.tone as string) ?? null,
            bannedWords: (styleValue.bannedWords as string[]) ?? null,
            signature: (styleValue.signature as string) ?? null,
            allowPriceMention: (styleValue.allowPriceMention as boolean) ?? null
          }
        : null
    );
  } catch (error) {
    console.error('[pipeline] Build reply-draft context failed:', error);
    return null;
  }
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
  interactionType: string
): Promise<void> {
  // ── Step 0: Blocklist / unsubscribe guard ─────────────────────────
  try {
    const blocked = await applyInteractionBlocklistGuard(db, {
      interactionId,
      content,
      platform,
      interactionType
    });
    if (blocked) return;
  } catch (error) {
    console.error('[pipeline] Blocklist guard failed:', error);
  }

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

    // ── Step 2a: reply-draft skill（注入画像/历史/话术，spec/47 G2）────────
    // AI 失败返回 null / needsHuman 时都不得假装 AI 成功：
    // 前者直接走下方回退链路；后者保留规则草稿但强制人工审核。
    let draftNeedsHuman = false;
    let draftNeedsHumanReason: string | undefined;
    try {
      const draftContext = await buildReplyDraftPipelineContext(db, {
        interactionId,
        content,
        platform,
        interactionType
      });
      if (draftContext) {
        const draft = await draftReply(
          getSharedSkillRunner(),
          draftContext
        );
        if (draft?.needsHuman) {
          draftNeedsHuman = true;
          draftNeedsHumanReason = draft.reason || 'AI 判定需人工处理';
        } else if (draft?.draftText?.trim()) {
          reply = {
            suggestedText: draft.draftText,
            replyType: draft.replyType || 'faq_answer',
            riskLevel: draft.riskLevel || 'low',
            needReview: false,
            reason: draft.reason ? `reply-draft: ${draft.reason}` : undefined
          };
        }
      }
    } catch (error) {
      console.error('[pipeline] reply-draft skill failed, fallback:', error);
    }

    // ── Step 2b: 回退链路 reply-suggestion skill ──────────────────────
    if (!reply) {
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
    }

    if (!reply) {
      reply = generateRuleBasedReply(content, classification, platform);
    }

    // reply-draft 判定需人工处理时，保留回退草稿供审核参考，但强制人工审核
    if (draftNeedsHuman) {
      reply.needReview = true;
      reply.reason = draftNeedsHumanReason;
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
    // 生成建议时记录关联线索（spec/53 T2）：Step 1 转化产生的 Lead 以
    // 本互动为来源互动；查不到（D 级/历史/无组织）保持 NULL，发送侧回退反查。
    const interactionForLead = await db.interaction
      .findUnique({
        where: { id: interactionId },
        select: { organizationId: true }
      })
      .catch(() => null);
    const suggestionLead = await db.lead
      .findFirst({
        where: {
          sourceInteractionId: interactionId,
          deletedAt: null,
          ...(interactionForLead?.organizationId
            ? { organizationId: interactionForLead.organizationId }
            : {})
        },
        select: { id: true }
      })
      .catch(() => null);
    await db.replySuggestion.create({
      data: {
        interactionId,
        leadId: suggestionLead?.id ?? null,
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
      publishJobId: true,
      conversationId: true,
      content: true
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

  const assignment = existing
    ? null
    : await applyAssignmentRules(
        db,
        interaction.organizationId ?? '',
        { channel: interaction.platform, level: newLevel },
        'lead'
      ).catch(() => null);

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
      assignedTo: assignment?.assigneeId ?? null,
      nextAction: classification.nextAction || '首次联系',
      nextActionAt: defaultNextActionAt(newLevel),
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

  if (!interaction.organizationId) return;

  const customerLink = await ensureCustomerFromInteraction(db, {
    organizationId: interaction.organizationId,
    userId: interaction.userId,
    interactionId,
    leadId: lead.id,
    platform: interaction.platform,
    platformAccountId: interaction.platformAccountId,
    externalUserId: interaction.externalUserId,
    externalUserName: interaction.externalUserName,
    conversationId: interaction.conversationId,
    content: interaction.content,
    intent: classification.intent,
    summary: classification.summary,
    leadLevel: newLevel,
    source: 'auto_pipeline'
  }).catch((err) => {
    console.error('[pipeline] Customer link failed:', err);
    return null;
  });

  await db.interaction.update({
    where: { id: interactionId },
    data: { status: 'CONVERTED_TO_LEAD' }
  });

  // Experiment conversion: count this lead against the content item that
  // produced the interaction. Deduped by lead id; best-effort.
  if (interaction.publishJobId && interaction.organizationId) {
    await recordLeadConversionForPublishJob(
      db,
      interaction.organizationId,
      interaction.publishJobId,
      lead.id
    );
  }

  if (customerLink) {
    await trySyncCustomerToFeishu(
      db,
      customerLink.customer.id,
      interaction.organizationId,
      'system'
    );
  }

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
        actionUrl: customerLink
          ? `/customers/${customerLink.customer.id}`
          : `/customers`
      }
    } as never)
    .catch(() => {
      /* notification write is best-effort */
    });

  // 客户已写入 CRM 时走客户飞书同步，避免同一条互动在多维表格里重复建两行。
  if (!customerLink) {
    await enqueueLeadSinkSync(db, lead.id, interaction.organizationId).catch(
      (err) => console.error('[pipeline] Lead sink enqueue failed:', err)
    );
  }

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
