/**
 * 回复回写线索（spec/53 T2）纯函数。
 *
 * 1. leadId 解析顺序：ReplySuggestion.leadId 优先，否则 Interaction
 *    经 Lead.sourceInteractionId 反查到的线索 ID（反查本身是 DB 查询，
 *    由调用方完成后把结果传入）。
 * 2. 回复发送成功后的目标状态流转：NEW / ASSIGNED → CONTACTED，
 *    其余状态（含非法/未知流转）一律保持原状态。
 */

export interface ReplyLeadResolutionInput {
  /** 建议自身记录的 leadId（新数据）；空/空串视为缺失 */
  suggestionLeadId?: string | null;
  /** 按 Lead.sourceInteractionId 反查到的 leadId（历史数据回退路径） */
  leadIdByInteraction?: string | null;
}

/** 回复发送成功后的状态流转表：仅 NEW/ASSIGNED 推进为 CONTACTED */
export const LEAD_STATUS_ON_REPLY_SENT: Readonly<
  Record<string, string>
> = Object.freeze({
  NEW: 'CONTACTED',
  ASSIGNED: 'CONTACTED'
});

export function resolveReplyLeadId(
  input: ReplyLeadResolutionInput
): string | null {
  const fromSuggestion = input.suggestionLeadId?.trim();
  if (fromSuggestion) return fromSuggestion;
  const fromInteraction = input.leadIdByInteraction?.trim();
  return fromInteraction || null;
}

export function nextLeadStatusAfterReplySent(currentStatus: string): string {
  return LEAD_STATUS_ON_REPLY_SENT[currentStatus] ?? currentStatus;
}
