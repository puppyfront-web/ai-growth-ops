/**
 * 获客任务零结果警告文案。
 *
 * 搜索空结果时 browser-runner 会返回机器可读原因（SEARCH_*），这里把原因
 * 翻译成面向用户的警告；没有原因（旧版 runner 或未知信号）时保留旧的
 * Cookie 兜底文案，避免把「页面未加载」误报成「登录失效」。
 */
export type SearchEmptyReason =
  | 'SEARCH_PAGE_NOT_LOADED'
  | 'SEARCH_LOGIN_REQUIRED'
  | 'SEARCH_EMPTY'
  | 'SEARCH_ALL_SKIPPED'
  | 'SEARCH_UNKNOWN';

export interface ZeroResultWarningInput {
  totalComments: number;
  totalCandidates: number;
  skippedDuplicates: number;
  /** 各搜索 query 空结果时 browser-runner 返回的 reasonCode 集合。 */
  searchEmptyReasons?: readonly string[];
}

const LEGACY_ZERO_COMMENT_WARNING =
  '未抓取到评论，可能是 Cookie 失效、触发验证码或搜索无结果，请检查抖音登录后重新执行';

export function buildZeroResultWarning(
  input: ZeroResultWarningInput
): string | undefined {
  if (input.totalCandidates > 0 || input.skippedDuplicates > 0) {
    return undefined;
  }
  if (input.totalComments > 0) {
    return '已抓取评论但未找到达到阈值的潜客，可调低「最低相关度」后重新执行';
  }

  const reasons = new Set(input.searchEmptyReasons ?? []);
  if (reasons.has('SEARCH_PAGE_NOT_LOADED')) {
    return '抖音搜索页未加载出结果（多为平台风控拦截或页面结构变化），任务已按零结果结束；可稍后重试，或打开浏览器完成验证后重新执行';
  }
  if (reasons.has('SEARCH_LOGIN_REQUIRED')) {
    return '抖音搜索页要求登录，账号登录态未在搜索页生效；请在「集成配置」重新扫码授权后再执行';
  }
  if (reasons.has('SEARCH_ALL_SKIPPED')) {
    return '搜索到的视频均为近期已抓取，已自动跳过；可勾选「强制重抓」或调整关键词后重新执行';
  }
  if (reasons.has('SEARCH_EMPTY')) {
    return '关键词搜索无结果；可调整关键词后重新执行';
  }
  return LEGACY_ZERO_COMMENT_WARNING;
}
