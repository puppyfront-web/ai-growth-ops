/**
 * AI 回复草稿（reply-draft）上下文构建纯函数。
 *
 * 输入：互动（评论/私信）、客户画像摘要（可空）、最近历史互动（可空）、
 * 品牌话术配置（可空）。输出：可直接 JSON 序列化的结构化 context，
 * 作为 packages/skills `reply-draft` skill 的输入。
 */

export const REPLY_DRAFT_MAX_CONTENT_LENGTH = 2000;
export const REPLY_DRAFT_MAX_HISTORY_ITEMS = 5;
export const REPLY_DRAFT_MAX_HISTORY_ITEM_LENGTH = 500;
export const REPLY_DRAFT_MAX_PROFILE_SUMMARY_LENGTH = 500;

export interface ReplyDraftInteractionInput {
  /** 平台标识，如 douyin */
  platform: string;
  /** 互动类型：comment / direct_message 等 */
  interactionType: string;
  /** 互动原文（评论或私信文本） */
  content: string;
  /** 来源内容标题（如评论所属视频标题），可空 */
  sourceContentTitle?: string | null;
}

export interface ReplyDraftCustomerProfileInput {
  /** 客户画像摘要文本 */
  summary?: string | null;
  /** 线索等级 A/B/C/D */
  leadLevel?: string | null;
  /** 意图标签 */
  intent?: string | null;
}

export interface ReplyDraftHistoryItem {
  /** 方向：inbound（客户发出）/ outbound（我方发出） */
  direction?: string | null;
  /** 互动文本 */
  content: string;
  /** 发生时间（ISO 字符串），可空 */
  occurredAt?: string | null;
}

export interface ReplyDraftStyleConfig {
  /** 品牌语气描述 */
  tone?: string | null;
  /** 禁用词列表 */
  bannedWords?: string[] | null;
  /** 固定签名 */
  signature?: string | null;
  /** 是否允许在回复中出现价格 */
  allowPriceMention?: boolean | null;
}

export interface ReplyDraftContext {
  interaction: {
    platform: string;
    type: string;
    content: string;
    truncated: boolean;
    sourceContentTitle?: string;
  };
  customerProfile: {
    summary: string;
    leadLevel?: string;
    intent?: string;
  } | null;
  recentInteractions: Array<{
    direction?: string;
    content: string;
    occurredAt?: string;
  }>;
  brandStyle:
    | {
        tone?: string;
        bannedWords: string[];
        signature?: string;
        allowPriceMention: boolean;
      }
    | null;
}

function truncateText(text: string, maxLength: number): { text: string; truncated: boolean } {
  if (text.length <= maxLength) return { text, truncated: false };
  return { text: text.slice(0, maxLength), truncated: true };
}

function normalizeOptionalText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 构建 reply-draft skill 的结构化输入 context。
 * 纯函数：不改输入、不抛业务异常；超长文本按上限截断并打标记。
 */
export function buildReplyDraftContext(
  interaction: ReplyDraftInteractionInput,
  customerProfile?: ReplyDraftCustomerProfileInput | null,
  recentInteractions?: ReplyDraftHistoryItem[] | null,
  brandStyle?: ReplyDraftStyleConfig | null
): ReplyDraftContext {
  const content = normalizeOptionalText(interaction.content);
  const { text: truncatedContent, truncated } = truncateText(
    content,
    REPLY_DRAFT_MAX_CONTENT_LENGTH
  );

  const sourceContentTitle = normalizeOptionalText(interaction.sourceContentTitle);

  const interactionField: ReplyDraftContext['interaction'] = {
    platform: interaction.platform,
    type: interaction.interactionType,
    content: truncatedContent,
    truncated
  };
  if (sourceContentTitle) interactionField.sourceContentTitle = sourceContentTitle;

  const summary = normalizeOptionalText(customerProfile?.summary);
  const profileField: ReplyDraftContext['customerProfile'] = summary
    ? {
        summary: truncateText(summary, REPLY_DRAFT_MAX_PROFILE_SUMMARY_LENGTH).text,
        ...(customerProfile?.leadLevel
          ? { leadLevel: customerProfile.leadLevel }
          : {}),
        ...(customerProfile?.intent ? { intent: customerProfile.intent } : {})
      }
    : null;

  const historyField = (recentInteractions ?? [])
    .slice(-REPLY_DRAFT_MAX_HISTORY_ITEMS)
    .map((item) => ({
      ...(item.direction ? { direction: item.direction } : {}),
      content: truncateText(
        normalizeOptionalText(item.content),
        REPLY_DRAFT_MAX_HISTORY_ITEM_LENGTH
      ).text,
      ...(item.occurredAt ? { occurredAt: item.occurredAt } : {})
    }));

  const styleField: ReplyDraftContext['brandStyle'] =
    brandStyle &&
    (normalizeOptionalText(brandStyle.tone) ||
      (brandStyle.bannedWords?.length ?? 0) > 0 ||
      normalizeOptionalText(brandStyle.signature) ||
      brandStyle.allowPriceMention != null)
      ? {
          ...(normalizeOptionalText(brandStyle.tone)
            ? { tone: normalizeOptionalText(brandStyle.tone) }
            : {}),
          bannedWords: (brandStyle.bannedWords ?? [])
            .map((word) => normalizeOptionalText(word))
            .filter((word) => word.length > 0),
          ...(normalizeOptionalText(brandStyle.signature)
            ? { signature: normalizeOptionalText(brandStyle.signature) }
            : {}),
          allowPriceMention: brandStyle.allowPriceMention === true
        }
      : null;

  return {
    interaction: interactionField,
    customerProfile: profileField,
    recentInteractions: historyField,
    brandStyle: styleField
  };
}
