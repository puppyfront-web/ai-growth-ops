import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import {
  DealCard,
  isDealOverdue
} from '@/components/deals/DealCard';
import type { Deal } from '@/types/deal';

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'deal-1',
    organizationId: 'org-1',
    userId: 'user-1',
    customerId: 'customer-1',
    leadId: null,
    title: '年度私域工具采购',
    stage: 'qualified',
    amount: '12000.00',
    currency: 'CNY',
    expectedCloseDate: null,
    ownerId: null,
    nextAction: '发送报价单',
    nextActionAt: '2026-10-20T02:00:00.000Z',
    lastContactedAt: null,
    sourceChannel: 'douyin',
    sourceContentItemId: null,
    sourcePublishJobId: null,
    lostReason: null,
    wonAt: null,
    closedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    deletedAt: null,
    customer: {
      id: 'customer-1',
      displayName: '张总',
      phone: '13800000000',
      status: 'active',
      channel: 'douyin'
    },
    lead: null,
    ...overrides
  };
}

describe('DealCard', () => {
  it('renders customer, amount and next action', () => {
    render(
      <DndContext>
        <DealCard deal={deal()} />
      </DndContext>
    );

    expect(screen.getByText('年度私域工具采购')).toBeInTheDocument();
    expect(screen.getByText('张总')).toBeInTheDocument();
    expect(screen.getByText(/12,000/)).toBeInTheDocument();
    expect(screen.getByText('发送报价单')).toBeInTheDocument();
  });

  it('marks an open deal past its next action as overdue', () => {
    const overdue = deal({ nextActionAt: '2020-01-01T00:00:00.000Z' });
    expect(isDealOverdue(overdue)).toBe(true);

    render(
      <DndContext>
        <DealCard deal={overdue} />
      </DndContext>
    );
    expect(screen.getByText('已逾期')).toBeInTheDocument();
  });

  it('never marks won or lost deals as overdue', () => {
    expect(
      isDealOverdue(
        deal({ stage: 'won', nextActionAt: '2020-01-01T00:00:00.000Z' })
      )
    ).toBe(false);
    expect(
      isDealOverdue(
        deal({ stage: 'lost', nextActionAt: '2020-01-01T00:00:00.000Z' })
      )
    ).toBe(false);
  });
});
