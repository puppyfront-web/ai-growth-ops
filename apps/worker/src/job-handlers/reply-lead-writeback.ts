/**
 * 回复发送成功后的线索回写（spec/53 T2）。
 *
 * 在发送成功（ReplyAttempt status=sent）之后调用：
 * 1. 解析 leadId：ReplySuggestion.leadId 优先，否则按
 *    Lead.sourceInteractionId 反查（shared 纯函数定序）；
 * 2. 事务内：更新 Lead.lastContactedAt、写 LeadActivity(action=reply_sent)、
 *    按 shared 流转函数推进状态（NEW/ASSIGNED → CONTACTED，其余不变）。
 *
 * 回写失败只记录日志，不影响已成功的发送结果；发送失败路径不调用本函数。
 */

import type { LeadStatus } from '@prisma/client';
import type { DatabaseClient } from '@ai-growth-ops/database';
import { createLogger } from '@ai-growth-ops/observability';
import {
  nextLeadStatusAfterReplySent,
  resolveReplyLeadId
} from '@ai-growth-ops/shared';

const logger = createLogger('reply-lead-writeback');

export interface ReplyLeadWritebackInput {
  interactionId: string;
  /** 互动所属组织；非空时回写查询带组织过滤 */
  organizationId: string | null;
  /** 建议自身记录的 leadId（可空，历史建议无此字段） */
  suggestionLeadId?: string | null;
  /** 触发回写的建议 ID，仅用于活动 metadata 留痕 */
  replySuggestionId?: string | null;
  source: 'auto_reply' | 'manual_reply';
}

export async function writeBackReplyToLead(
  db: DatabaseClient,
  input: ReplyLeadWritebackInput
): Promise<void> {
  try {
    // 反查：该互动是否为某条 Lead 的来源互动（组织隔离过滤）
    const interactionLead = await db.lead.findFirst({
      where: {
        sourceInteractionId: input.interactionId,
        deletedAt: null,
        ...(input.organizationId
          ? { organizationId: input.organizationId }
          : {})
      },
      select: { id: true }
    });

    const leadId = resolveReplyLeadId({
      suggestionLeadId: input.suggestionLeadId ?? null,
      leadIdByInteraction: interactionLead?.id ?? null
    });
    if (!leadId) {
      logger.info('Reply writeback skipped: no lead resolved', {
        interactionId: input.interactionId
      });
      return;
    }

    await db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: {
          id: leadId,
          deletedAt: null,
          ...(input.organizationId
            ? { organizationId: input.organizationId }
            : {})
        },
        select: { id: true, status: true }
      });
      if (!lead) {
        logger.info('Reply writeback skipped: lead not found', { leadId });
        return;
      }

      const nextStatus = nextLeadStatusAfterReplySent(lead.status);
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          lastContactedAt: new Date(),
          // 仅在状态实际推进时写入，非法/无需流转保持原状态
          ...(nextStatus !== lead.status
            ? { status: nextStatus as LeadStatus }
            : {})
        }
      });

      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          action: 'reply_sent',
          note:
            input.source === 'auto_reply'
              ? '自动回复已发送'
              : '人工回复已发送',
          operator: 'system',
          metadata: {
            detail: `${input.source}_sent`,
            interactionId: input.interactionId,
            ...(input.replySuggestionId
              ? { replySuggestionId: input.replySuggestionId }
              : {}),
            ...(nextStatus !== lead.status
              ? { statusTransition: `${lead.status}→${nextStatus}` }
              : {})
          }
        }
      });

      logger.info('Reply writeback done', {
        leadId: lead.id,
        interactionId: input.interactionId,
        statusTransition:
          nextStatus !== lead.status ? `${lead.status}→${nextStatus}` : 'none'
      });
    });
  } catch (err) {
    // 回写是发送成功后的增强动作：失败只告警，不把已成功的发送重试
    logger.error('Reply lead writeback failed', {
      interactionId: input.interactionId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
