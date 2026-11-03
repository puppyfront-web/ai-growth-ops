import { describe, expect, it } from 'vitest';
import { detectUnsubscribeIntent } from '@ai-growth-ops/shared';

describe('detectUnsubscribeIntent', () => {
  it.each([
    '退订',
    '帮我退订',
    '不要再发了',
    '请不要再发消息给我',
    '别再发了，谢谢',
    '别再发这种通知了',
    '取消关注通知',
    '我要取消关注通知',
    '别再给我发了',
    '不要再给我发了',
    '别再联系我',
    '不要再联系我了',
    '别再推送了',
    '不要再推送消息'
  ])('识别明确退订意图: %s', (text) => {
    expect(detectUnsubscribeIntent(text)).toBe(true);
  });

  it.each([
    '',
    '好的，谢谢',
    '请问价格是多少',
    '我想了解一下产品',
    '取消关注的账号还能找回吗',
    '发货了吗'
  ])('无退订意图文本返回 false: %s', (text) => {
    expect(detectUnsubscribeIntent(text)).toBe(false);
  });

  it('大小写与空白不影响判定', () => {
    expect(detectUnsubscribeIntent('  请退订\n ')).toBe(true);
  });

  it('非字符串输入返回 false', () => {
    expect(detectUnsubscribeIntent(null as unknown as string)).toBe(false);
    expect(detectUnsubscribeIntent(undefined as unknown as string)).toBe(false);
  });
});
