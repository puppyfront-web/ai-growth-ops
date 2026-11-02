import { describe, expect, it } from 'vitest';
import { classifyLlmError } from '@ai-growth-ops/shared';

describe('classifyLlmError', () => {
  it('余额不足类错误归为 quota', () => {
    expect(
      classifyLlmError('402 Insufficient Balance (request_id: 97225227)')
    ).toBe('quota');
    expect(classifyLlmError('insufficient_quota: 请充值后重试')).toBe('quota');
    expect(classifyLlmError('Quota exceeded for this month')).toBe('quota');
  });

  it('鉴权类错误归为 auth', () => {
    expect(classifyLlmError('401 Unauthorized')).toBe('auth');
    expect(classifyLlmError('invalid api key provided')).toBe('auth');
    expect(classifyLlmError('authentication_error: bad key')).toBe('auth');
  });

  it('超时/解析失败/未配置/未知分别归类', () => {
    expect(classifyLlmError('Request timed out after 60000ms')).toBe('timeout');
    expect(classifyLlmError('Failed to parse LLM output as JSON: {oops')).toBe(
      'parse'
    );
    expect(classifyLlmError('请先配置 LLM 服务')).toBe('not_configured');
    expect(classifyLlmError('connection reset by peer')).toBe('error');
    expect(classifyLlmError(undefined)).toBe('error');
  });
});
