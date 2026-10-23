import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ProspectListRow } from '@/components/prospecting/ProspectListRow';
import type { ProspectCandidate } from '@/lib/api/prospecting';

function candidate(overrides: Partial<ProspectCandidate> = {}) {
  return {
    id: 'candidate-1',
    userNickname: '张老板',
    avatarUrl: null,
    content: '想采购一套私域工具',
    relevanceScore: 90,
    leadLevel: 'A',
    customerId: null,
    ...overrides
  } as ProspectCandidate;
}

function setup(overrides: Partial<ProspectCandidate> = {}, selected = false) {
  const onSelect = vi.fn();
  const c = candidate(overrides);
  render(
    <ProspectListRow candidate={c} selected={selected} onSelect={onSelect} />
  );
  return { onSelect, c };
}

describe('ProspectListRow', () => {
  it('渲染昵称、等级、相关度与评论摘要', () => {
    setup();
    expect(screen.getByText('张老板')).toBeTruthy();
    expect(screen.getByText('高意向')).toBeTruthy();
    expect(screen.getByText('90')).toBeTruthy();
    expect(screen.getByText('想采购一套私域工具')).toBeTruthy();
  });

  it('点击行回调完整 candidate', async () => {
    const { onSelect, c } = setup();
    await userEvent.click(screen.getByRole('button', { name: /张老板/ }));
    expect(onSelect).toHaveBeenCalledWith(c);
  });

  it('选中态带 aria-pressed', () => {
    setup({}, true);
    expect(
      screen.getByRole('button', { name: /张老板/ }).getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('DOM id 用于深链锚点', () => {
    setup();
    expect(document.getElementById('candidate-candidate-1')).toBeTruthy();
  });

  it('已转化显示徽标且行内无操作按钮', () => {
    setup({ customerId: 'customer-1' });
    expect(screen.getByText('已转客户')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '转客户' })).toBeNull();
  });
});
