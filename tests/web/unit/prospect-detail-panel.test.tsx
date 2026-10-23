import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ProspectDetailPanel } from '@/components/prospecting/ProspectDetailPanel';
import type { ProspectCandidate } from '@/lib/api/prospecting';

function candidate(overrides: Partial<ProspectCandidate> = {}) {
  return {
    id: 'candidate-1',
    prospectingTaskId: 'task-1',
    platform: 'douyin',
    userKey: 'user-1',
    externalUserId: 'ext-1',
    userNickname: '张老板',
    userHomepage: 'https://example.com/user/1',
    avatarUrl: null,
    content: '第一条评论',
    commentCount: 1,
    evidence: [
      { content: '第一条评论', sourceVideoTitle: null, sourceVideoUrl: null, publishedAt: null, likeCount: 3 },
      { content: '第二条评论', sourceVideoTitle: null, sourceVideoUrl: null, publishedAt: null, likeCount: 2 },
      { content: '第三条评论', sourceVideoTitle: null, sourceVideoUrl: null, publishedAt: null, likeCount: 1 },
      { content: '第四条评论', sourceVideoTitle: null, sourceVideoUrl: null, publishedAt: null, likeCount: 0 }
    ],
    sourceVideoTitle: null,
    sourceVideoUrl: null,
    relevanceScore: 90,
    leadLevel: 'A',
    scoreSource: 'skill',
    summary: '主动询价',
    matchedKeywords: ['采购'],
    attributions: null,
    customerId: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    metadata: null,
    ...overrides
  } as ProspectCandidate;
}

function setup(overrides: Partial<ProspectCandidate> = {}) {
  const onEnrich = vi.fn();
  const onConvert = vi.fn();
  render(
    <ProspectDetailPanel
      candidate={candidate(overrides)}
      strategies={[{ id: 'pain', title: '痛点求助' }]}
      enrichBusy={false}
      onEnrich={onEnrich}
      onConvert={onConvert}
    />
  );
  return { onEnrich, onConvert };
}

describe('ProspectDetailPanel', () => {
  it('全量渲染所有评论，不提供折叠', () => {
    setup();
    expect(screen.getByText('第一条评论')).toBeTruthy();
    expect(screen.getByText('第二条评论')).toBeTruthy();
    expect(screen.getByText('第三条评论')).toBeTruthy();
    expect(screen.getByText('第四条评论')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /展开其余/ })).toBeNull();
  });

  it('点击头像触发采集回调', async () => {
    const { onEnrich } = setup();
    await userEvent.click(screen.getByRole('button', { name: '采集主页资料' }));
    expect(onEnrich).toHaveBeenCalledWith('candidate-1');
  });

  it('未转化时点击转客户回调', async () => {
    const { onConvert } = setup();
    await userEvent.click(screen.getByRole('button', { name: '转客户' }));
    expect(onConvert).toHaveBeenCalledTimes(1);
  });

  it('已转化时显示已转客户链接', () => {
    setup({ customerId: 'customer-1' });
    const badge = screen.getByText('已转客户');
    expect(badge.getAttribute('href')).toBe('/customers/customer-1');
    expect(screen.queryByRole('button', { name: '转客户' })).toBeNull();
  });

  it('采集失败时展示失败原因', () => {
    setup({
      metadata: {
        enrichStatus: 'failed',
        enrichError: '登录已失效'
      }
    });
    expect(screen.getByText('主页采集失败：登录已失效')).toBeTruthy();
  });
});
