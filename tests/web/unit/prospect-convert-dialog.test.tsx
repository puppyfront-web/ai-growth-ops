import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/client';
import { ConvertDialog } from '@/components/prospecting/ConvertDialog';
import type { ProspectCandidate } from '@/lib/api/prospecting';

const convertProspectToCustomer = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/prospecting', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/lib/api/prospecting')>();
  return { ...original, convertProspectToCustomer };
});

const candidate = {
  id: 'candidate-1',
  userNickname: '张老板',
  avatarUrl: null,
  content: '求一份报价单',
  relevanceScore: 88,
  leadLevel: 'A',
  customerId: null,
  summary: '正在选型',
  metadata: null
} as ProspectCandidate;

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <ConvertDialog
        candidate={candidate}
        onClose={vi.fn()}
        onDone={vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe('ConvertDialog', () => {
  beforeEach(() => {
    convertProspectToCustomer.mockReset();
  });

  it('渲染潜客昵称与转入表单，默认可直接转入', () => {
    setup();
    expect(screen.getByText('张老板')).toBeTruthy();
    expect(screen.getByRole('button', { name: '确认转入' })).toBeTruthy();
  });

  it('409 重复客户：展示重复项并切换为「仍要新建」，确认后带 confirmDuplicate 重试', async () => {
    const user = userEvent.setup();
    convertProspectToCustomer
      .mockRejectedValueOnce(
        new ApiError(
          409,
          'DUPLICATE',
          '手机号已存在',
          { duplicates: [{ id: 'c-9', displayName: '张老板', phone: '13800000000', company: 'A 公司', role: '负责人' }] }
        )
      )
      .mockResolvedValueOnce({
        reused: false,
        customer: { id: 'c-new' }
      } as never);
    const onDone = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    render(
      <QueryClientProvider client={client}>
        <ConvertDialog candidate={candidate} onClose={vi.fn()} onDone={onDone} />
      </QueryClientProvider>
    );

    await user.type(screen.getByLabelText('手机号（选填）'), '13800001111');
    await user.click(screen.getByRole('button', { name: '确认转入' }));

    expect(await screen.findByText('手机号已存在，确认仍要新建？')).toBeTruthy();
    expect(screen.getByText('查看已有客户')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '仍要新建' })
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '仍要新建' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ reused: false, customerId: 'c-new' }));
    expect(convertProspectToCustomer).toHaveBeenLastCalledWith(
      'candidate-1',
      expect.objectContaining({ confirmDuplicate: true })
    );
  });
});
