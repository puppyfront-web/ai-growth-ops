import { describe, it, expect } from 'vitest';
import {
  buildReplyDraftContext,
  REPLY_DRAFT_MAX_CONTENT_LENGTH,
  REPLY_DRAFT_MAX_HISTORY_ITEMS,
  type ReplyDraftInteractionInput,
  type ReplyDraftHistoryItem,
  type ReplyDraftStyleConfig
} from '@ai-growth-ops/shared';

describe('buildReplyDraftContext', () => {
  it('全空可选输入：仅互动必需字段时输出结构化 context', () => {
    const interaction: ReplyDraftInteractionInput = {
      platform: 'douyin',
      interactionType: 'comment',
      content: '请问多少钱？'
    };
    const ctx = buildReplyDraftContext(interaction);

    expect(ctx.interaction).toEqual({
      platform: 'douyin',
      type: 'comment',
      content: '请问多少钱？',
      truncated: false
    });
    expect(ctx.customerProfile).toBeNull();
    expect(ctx.recentInteractions).toEqual([]);
    expect(ctx.brandStyle).toBeNull();
  });

  it('保留画像摘要、历史互动与品牌话术配置', () => {
    const history: ReplyDraftHistoryItem[] = [
      { direction: 'inbound', content: '之前问过价格', occurredAt: '2026-11-01T00:00:00.000Z' },
      { direction: 'outbound', content: '已发送资料' }
    ];
    const style: ReplyDraftStyleConfig = {
      tone: '专业、克制',
      bannedWords: ['最便宜', '保证'],
      signature: '——官方客服',
      allowPriceMention: false
    };
    const ctx = buildReplyDraftContext(
      { platform: 'douyin', interactionType: 'direct_message', content: '发我一份案例' },
      { summary: 'A 级高意向客户，关注价格与案例', leadLevel: 'A', intent: 'case_request' },
      history,
      style
    );

    expect(ctx.customerProfile).toEqual({
      summary: 'A 级高意向客户，关注价格与案例',
      leadLevel: 'A',
      intent: 'case_request'
    });
    expect(ctx.recentInteractions).toHaveLength(2);
    expect(ctx.recentInteractions[0]).toEqual({
      direction: 'inbound',
      content: '之前问过价格',
      occurredAt: '2026-11-01T00:00:00.000Z'
    });
    expect(ctx.brandStyle).toEqual(style);
  });

  it('超长互动文本按字符截断', () => {
    const long = '价'.repeat(REPLY_DRAFT_MAX_CONTENT_LENGTH + 100);
    const ctx = buildReplyDraftContext({
      platform: 'douyin',
      interactionType: 'comment',
      content: long
    });
    expect(ctx.interaction.content).toHaveLength(REPLY_DRAFT_MAX_CONTENT_LENGTH);
    expect(ctx.interaction.content).toBe('价'.repeat(REPLY_DRAFT_MAX_CONTENT_LENGTH));
    expect(ctx.interaction.truncated).toBe(true);
  });

  it('历史互动超过上限时只保留最近 N 条且每条截断', () => {
    const history: ReplyDraftHistoryItem[] = Array.from(
      { length: REPLY_DRAFT_MAX_HISTORY_ITEMS + 3 },
      (_, i) => ({ direction: 'inbound', content: `消息${i}` })
    );
    const ctx = buildReplyDraftContext(
      { platform: 'douyin', interactionType: 'direct_message', content: '在吗' },
      null,
      history
    );
    expect(ctx.recentInteractions).toHaveLength(REPLY_DRAFT_MAX_HISTORY_ITEMS);
    // 保留数组末尾（最近）的 N 条
    expect(ctx.recentInteractions[0]?.content).toBe(
      `消息${3}`
    );
    expect(ctx.recentInteractions.at(-1)?.content).toBe(
      `消息${REPLY_DRAFT_MAX_HISTORY_ITEMS + 2}`
    );
  });

  it('互动内容空白文本被规范化为空字符串', () => {
    const ctx = buildReplyDraftContext({
      platform: 'douyin',
      interactionType: 'comment',
      content: '   '
    });
    expect(ctx.interaction.content).toBe('');
  });

  it('空数组与空对象可选输入等价于 null', () => {
    const ctx = buildReplyDraftContext(
      { platform: 'douyin', interactionType: 'comment', content: 'hello' },
      {},
      [],
      {}
    );
    expect(ctx.customerProfile).toBeNull();
    expect(ctx.recentInteractions).toEqual([]);
    expect(ctx.brandStyle).toBeNull();
  });

  it('输出可直接 JSON 序列化（供 skill 输入）', () => {
    const ctx = buildReplyDraftContext({
      platform: 'douyin',
      interactionType: 'comment',
      content: '怎么报名'
    });
    expect(() => JSON.stringify(ctx)).not.toThrow();
    expect(JSON.parse(JSON.stringify(ctx)).interaction.platform).toBe('douyin');
  });
});
