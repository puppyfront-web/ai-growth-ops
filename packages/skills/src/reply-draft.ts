import type { ReplyDraftContext } from '@ai-growth-ops/shared';
import type { SkillRunner, SkillContext } from './types.js';
import type { LLMClient } from '@ai-growth-ops/ai';

export const REPLY_DRAFT_SKILL_NAME = 'reply-draft';

/** reply-draft skill 的输出契约（见 definitions/reply-draft/schema/output.schema.json） */
export interface ReplyDraftOutput {
  /** 敏感/投诉/法律风险等场景为 true：不生成草稿，转人工处理 */
  needsHuman: boolean;
  /** 草稿文本；needsHuman 时可为空字符串 */
  draftText?: string;
  replyType?: string;
  riskLevel: 'low' | 'medium' | 'high';
  reason?: string;
}

/**
 * 调用 reply-draft skill 生成回复草稿。
 *
 * 回退策略：LLM 失败/超时/输出无效时返回 null，
 * 由调用方回退到规则模板（不要在调用侧假装 AI 成功）。
 */
export async function draftReply(
  runner: SkillRunner,
  context: ReplyDraftContext,
  options?: { skillContext?: SkillContext; llmClient?: LLMClient }
): Promise<ReplyDraftOutput | null> {
  let result;
  try {
    result = await runner.run<ReplyDraftContext, ReplyDraftOutput>({
      skillName: REPLY_DRAFT_SKILL_NAME,
      input: context,
      ...(options?.skillContext ? { context: options.skillContext } : {}),
      ...(options?.llmClient ? { llmClient: options.llmClient } : {})
    });
  } catch {
    return null;
  }

  if (result.status !== 'success') return null;

  const output = result.output;
  if (!output || typeof output !== 'object') return null;
  if (typeof output.needsHuman !== 'boolean') return null;
  // 非人工场景必须有非空草稿，否则视为无效输出
  if (!output.needsHuman && !output.draftText?.trim()) return null;

  return output;
}

/** 判断草稿输出是否需要转人工（敏感内容拒绝自动输出） */
export function isReplyDraftNeedsHuman(output: ReplyDraftOutput | null): boolean {
  return output?.needsHuman === true;
}
