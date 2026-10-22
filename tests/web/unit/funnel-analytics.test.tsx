import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/analytics/funnel'
}));
vi.mock('@/lib/api/analytics', () => ({
  getUnifiedFunnel: vi.fn()
}));
vi.mock('@/lib/api/deals', () => ({
  listOverdueFollowUps: vi.fn()
}));

import { getUnifiedFunnel } from '@/lib/api/analytics';
import { listOverdueFollowUps } from '@/lib/api/deals';
import FunnelPage from '@/app/(dashboard)/analytics/funnel/page';

const mockedFunnel = vi.mocked(getUnifiedFunnel);
const mockedOverdue = vi.mocked(listOverdueFollowUps);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function funnel() {
  return {
    range: {
      from: '2026-09-19T00:00:00.000Z',
      to: '2026-10-19T00:00:00.000Z',
      days: 30
    },
    stages: [
      {
        key: 'published',
        label: '发布内容',
        count: 10,
        rateFromPrev: 0,
        rateFromStart: 100,
        ratioFromPrev: 0
      },
      {
        key: 'interactions',
        label: '互动',
        count: 200,
        rateFromPrev: 2000,
        rateFromStart: 2000,
        ratioFromPrev: 20
      },
      {
        key: 'leads',
        label: '线索',
        count: 40,
        rateFromPrev: 20,
        rateFromStart: 400,
        ratioFromPrev: 0.2
      },
      {
        key: 'customers',
        label: '客户',
        count: 20,
        rateFromPrev: 50,
        rateFromStart: 200,
        ratioFromPrev: 0.5
      },
      {
        key: 'deals',
        label: '商机',
        count: 12,
        rateFromPrev: 60,
        rateFromStart: 120,
        ratioFromPrev: 0.6
      },
      {
        key: 'won',
        label: '成交',
        count: 3,
        rateFromPrev: 25,
        rateFromStart: 30,
        ratioFromPrev: 0.3
      }
    ],
    revenue: {
      pipelineValue: '80000.00',
      wonRevenue: '36000.00',
      avgDealSize: '12000.00',
      currency: 'CNY'
    },
    byChannel: [
      { channel: 'douyin', leads: 30, customers: 15, won: 2, revenue: '24000.00' }
    ],
    byContent: [
      {
        contentItemId: 'content-1',
        title: '获客指南',
        published: 2,
        interactions: 80,
        leads: 12,
        customers: 6,
        won: 1,
        revenue: '12000.00'
      }
    ],
    overdue: { leads: 3, customers: 2, deals: 1 }
  };
}

describe('FunnelPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedOverdue.mockResolvedValue({ items: [], total: 0 });
  });

  it('renders the funnel stages and revenue KPIs', async () => {
    mockedFunnel.mockResolvedValue(funnel());

    render(<FunnelPage />, { wrapper });

    expect(await screen.findByText('转化漏斗')).toBeInTheDocument();
    expect(screen.getAllByText('发布内容').length).toBeGreaterThan(0);
    expect(screen.getAllByText('成交').length).toBeGreaterThan(0);
    expect(screen.getByText('¥36,000')).toBeInTheDocument();
    expect(screen.getByText('¥80,000')).toBeInTheDocument();
    expect(screen.getAllByText('¥12,000').length).toBeGreaterThan(0);
  });

  it('shows overdue counts and content attribution', async () => {
    mockedFunnel.mockResolvedValue(funnel());
    mockedOverdue.mockResolvedValue({
      items: [
        {
          type: 'lead',
          id: 'lead-1',
          name: '逾期线索',
          ownerId: null,
          nextAction: '首次联系',
          nextActionAt: '2026-10-18T00:00:00.000Z',
          overdueHours: 24,
          href: '/leads/lead-1'
        }
      ],
      total: 1
    });

    render(<FunnelPage />, { wrapper });

    expect(await screen.findByText(/线索 3 · 客户 2 · 商机 1/)).toBeInTheDocument();
    expect(await screen.findByText('逾期线索')).toBeInTheDocument();
    expect(screen.getByText('获客指南')).toBeInTheDocument();
  });

  it('shows an empty state when there is no activity', async () => {
    const empty = funnel();
    empty.stages = empty.stages.map((stage) => ({ ...stage, count: 0 }));
    empty.revenue = {
      pipelineValue: '0.00',
      wonRevenue: '0.00',
      avgDealSize: '0.00',
      currency: 'CNY'
    };
    empty.byChannel = [];
    empty.byContent = [];
    mockedFunnel.mockResolvedValue(empty);

    render(<FunnelPage />, { wrapper });

    expect(
      await screen.findByText(/还没有经营数据/)
    ).toBeInTheDocument();
  });
});
