import { describe, expect, it } from 'vitest';

import {
  LEAD_STATUS_ON_REPLY_SENT,
  nextLeadStatusAfterReplySent,
  resolveReplyLeadId
} from '../../../packages/shared/src/reply-lead-linkage.js';

describe('resolveReplyLeadId', () => {
  it('建议自身 leadId 优先', () => {
    expect(
      resolveReplyLeadId({
        suggestionLeadId: 'lead-sug',
        leadIdByInteraction: 'lead-interaction'
      })
    ).toBe('lead-sug');
  });

  it('建议无 leadId 时回退到 interaction 反查结果', () => {
    expect(
      resolveReplyLeadId({
        suggestionLeadId: null,
        leadIdByInteraction: 'lead-interaction'
      })
    ).toBe('lead-interaction');
  });

  it('两处均为空时返回 null（历史数据兼容）', () => {
    expect(
      resolveReplyLeadId({
        suggestionLeadId: null,
        leadIdByInteraction: null
      })
    ).toBeNull();
    expect(
      resolveReplyLeadId({ suggestionLeadId: undefined })
    ).toBeNull();
  });

  it('空字符串视为缺失，继续走反查', () => {
    expect(
      resolveReplyLeadId({
        suggestionLeadId: '',
        leadIdByInteraction: 'lead-x'
      })
    ).toBe('lead-x');
  });
});

describe('nextLeadStatusAfterReplySent', () => {
  it.each(['NEW', 'ASSIGNED'] as const)('%s → CONTACTED', (status) => {
    expect(nextLeadStatusAfterReplySent(status)).toBe('CONTACTED');
  });

  it.each([
    'CONTACTED',
    'QUALIFIED',
    'SYNCING',
    'SYNCED',
    'ADDED_WECOM',
    'WON',
    'LOST',
    'INVALID'
  ] as const)('%s 保持不变（非法流转返回原状态）', (status) => {
    expect(nextLeadStatusAfterReplySent(status)).toBe(status);
  });

  it('未知/空状态保持不变，不抛错', () => {
    expect(nextLeadStatusAfterReplySent('')).toBe('');
    expect(nextLeadStatusAfterReplySent('whatever')).toBe('whatever');
  });

  it('流转常量声明 new/assigned → contacted', () => {
    expect(LEAD_STATUS_ON_REPLY_SENT).toEqual({
      NEW: 'CONTACTED',
      ASSIGNED: 'CONTACTED'
    });
  });
});
