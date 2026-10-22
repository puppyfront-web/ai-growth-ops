import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/deals', () => ({
  listDeals: vi.fn(),
  createDeal: vi.fn(),
  updateDeal: vi.fn()
}));

import { listDeals, createDeal } from '@/lib/api/deals';
import { CustomerDeals } from '@/components/customers/CustomerDeals';
import type { Deal } from '@/types/deal';

const mockedListDeals = vi.mocked(listDeals);
const mockedCreateDeal = vi.mocked(createDeal);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'deal-1',
    organizationId: 'org-1',
    userId: 'user-1',
    customerId: 'customer-1',
    leadId: null,
    title: '年度采购',
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

describe('CustomerDeals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an empty state when the customer has no deals', async () => {
    mockedListDeals.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50
    });

    render(<CustomerDeals customerId="customer-1" />, { wrapper });

    expect(
      await screen.findByText(/还没有商机/)
    ).toBeInTheDocument();
  });

  it('renders the deal amount, stage and next action', async () => {
    mockedListDeals.mockResolvedValue({
      items: [deal()],
      total: 1,
      page: 1,
      pageSize: 50
    });

    render(<CustomerDeals customerId="customer-1" />, { wrapper });

    expect(await screen.findByText('年度采购')).toBeInTheDocument();
    expect(screen.getByText(/12,000/)).toBeInTheDocument();
    expect(screen.getByText('发送报价单')).toBeInTheDocument();
    expect(screen.getByDisplayValue('已确认需求')).toBeInTheDocument();
  });

  it('opens the create form and submits a new deal', async () => {
    const user = userEvent.setup();
    mockedListDeals.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50
    });
    mockedCreateDeal.mockResolvedValue(deal());

    render(<CustomerDeals customerId="customer-1" />, { wrapper });

    await user.click(screen.getByRole('button', { name: '新建商机' }));
    await user.type(
      screen.getByPlaceholderText('如：年度私域工具采购'),
      '新商机'
    );
    await user.click(screen.getByRole('button', { name: '创建商机' }));

    expect(mockedCreateDeal).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'customer-1',
        title: '新商机'
      })
    );
  });
});
