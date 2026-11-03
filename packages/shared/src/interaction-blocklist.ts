/**
 * 评论/私信用户级黑名单与退订意图判定（纯函数）。
 *
 * 依据 AGENTS.md 第 9 条：触达/回复必须有退订、黑名单、频控。
 * 退订关键词命中即视为明确退订意图，调用方应将目标用户加入
 * InteractionBlocklist（reason=unsubscribe）并停止一切触达。
 */

/** 明确退订意图关键词（命中任一即判定为退订）。 */
const UNSUBSCRIBE_KEYWORDS: readonly string[] = [
  '退订',
  '不要再发',
  '别再发',
  '取消关注通知',
  '不要再给我发',
  '别再给我发',
  '不要再联系',
  '别再联系',
  '不要再推送',
  '别再推送'
];

/**
 * 判断一段互动文本是否表达明确退订意图。
 * 仅做关键词包含匹配（大小写不敏感、忽略首尾空白）；
 * 非字符串输入返回 false。
 */
export function detectUnsubscribeIntent(text: string | null | undefined): boolean {
  if (typeof text !== 'string') return false;
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  return UNSUBSCRIBE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

/** 黑名单原因（与数据库 InteractionBlocklist.reason 对齐）。 */
export const INTERACTION_BLOCKLIST_REASONS = [
  'manual',
  'unsubscribe',
  'complaint'
] as const;

export type InteractionBlocklistReason =
  (typeof INTERACTION_BLOCKLIST_REASONS)[number];

/** 发送被黑名单拦截时使用的统一错误码。 */
export const BLOCKLISTED_TARGET_ERROR_CODE = 'BLOCKLISTED_TARGET';
