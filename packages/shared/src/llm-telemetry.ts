/**
 * LLM 调用失败的错误分类（纯函数）。
 * 现状：OpenAI/Anthropic SDK 把 HTTP 状态码揉进 message 文本抛出，
 * 这里按文本特征分类，供 ProviderRunLog.errorCode 与健康告警使用。
 */
export type LlmErrorCode =
  | 'quota'
  | 'auth'
  | 'timeout'
  | 'parse'
  | 'not_configured'
  | 'error';

export function classifyLlmError(message: string | undefined): LlmErrorCode {
  const text = (message ?? '').toLowerCase();
  if (
    text.includes('402') ||
    text.includes('insufficient balance') ||
    text.includes('insufficient_quota') ||
    text.includes('quota exceeded')
  ) {
    return 'quota';
  }
  if (
    text.includes('401') ||
    text.includes('unauthorized') ||
    text.includes('invalid api key') ||
    text.includes('authentication_error')
  ) {
    return 'auth';
  }
  if (text.includes('timeout') || text.includes('timed out')) {
    return 'timeout';
  }
  if (text.includes('failed to parse llm output')) {
    return 'parse';
  }
  if (text.includes('请先配置 llm') || text.includes('llm_not_configured')) {
    return 'not_configured';
  }
  return 'error';
}

export const LLM_ERROR_CODE_LABELS: Record<LlmErrorCode, string> = {
  quota: '余额或配额不足',
  auth: '鉴权失败（API Key 无效）',
  timeout: '请求超时',
  parse: '输出解析失败',
  not_configured: 'LLM 未配置',
  error: '未知错误'
};
