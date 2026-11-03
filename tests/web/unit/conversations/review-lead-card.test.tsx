import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeadSummaryCard } from '@/components/conversations/LeadSummaryCard';
import type { LeadSummary } from '@/lib/api/conversations';

const summary: LeadSummary = {
  id: 'lead-1',
  status: 'NEW',
  level: 'B',
  name: '张三',
  source: 'douyin',
  score: 82
};

describe('LeadSummaryCard', () => {
  it('有 leadSummary 时渲染评分、状态、来源并链接到线索详情', () => {
    render(<LeadSummaryCard leadSummary={summary} />);

    const card = screen.getByTestId('lead-summary-card');
    expect(card).toBeInTheDocument();
    // 状态文案
    expect(card.textContent).toContain('新线索');
    // 来源平台文案
    expect(card.textContent).toContain('抖音');
    // 评分
    expect(card.textContent).toContain('82');

    const link = screen.getByTestId('lead-summary-link');
    expect(link).toHaveAttribute('href', '/leads/lead-1');
    expect(link.textContent).toContain('查看线索');
  });

  it('缺少 score 时不渲染评分行', () => {
    render(
      <LeadSummaryCard
        leadSummary={{ id: 'lead-2', status: 'WON', level: 'A', name: '李四', source: 'zhihu' }}
      />
    );
    const card = screen.getByTestId('lead-summary-card');
    expect(card.textContent).toContain('已成交');
    expect(screen.queryByTestId('lead-summary-score')).toBeNull();
  });

  it('无 leadSummary 时不渲染任何内容', () => {
    const { container } = render(<LeadSummaryCard leadSummary={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('lead-summary-card')).toBeNull();
  });
});
