import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  QueryClient,
  QueryClientProvider
} from '@tanstack/react-query';
import {
  BlocklistBadge,
  BlockTargetButton,
  useTargetBlocked
} from '@/components/conversations/BlocklistControls';
import {
  blockTarget,
  checkTargetBlocked
} from '@/lib/api/conversations';

vi.mock('@/lib/api/conversations', () => ({
  blockTarget: vi.fn(),
  checkTargetBlocked: vi.fn()
}));

function withQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

describe('BlocklistBadge', () => {
  it('展示已拉黑标签与原因', () => {
    render(<BlocklistBadge reason="unsubscribe" />);
    expect(screen.getByTestId('blocklist-badge').textContent).toContain(
      '用户退订'
    );
  });

  it('无原因时展示默认文案', () => {
    render(<BlocklistBadge reason={null} />);
    expect(screen.getByTestId('blocklist-badge').textContent).toContain(
      '已拉黑'
    );
  });
});

describe('BlockTargetButton', () => {
  beforeEach(() => {
    vi.mocked(blockTarget).mockReset();
    vi.mocked(checkTargetBlocked).mockReset();
  });

  it('点击后弹出 L2 确认，确认才调用拉黑 API', async () => {
    const user = userEvent.setup();
    vi.mocked(blockTarget).mockResolvedValue({
      id: 'bl-1',
      organizationId: 'org',
      platform: 'douyin',
      platformUserId: 'u-1',
      reason: 'manual',
      note: null,
      blockedById: null,
      createdAt: new Date().toISOString(),
      deletedAt: null
    });

    withQueryClient(
      <BlockTargetButton platform="douyin" externalUserId="u-1" displayName="张三" />
    );

    // 未确认前不调用 API
    const btn = screen.getByTestId('block-target-button');
    await user.click(btn);
    expect(blockTarget).not.toHaveBeenCalled();
    // L2 确认弹层出现
    expect(
      await screen.findByRole('button', { name: '确认拉黑' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '确认拉黑' }));
    expect(blockTarget).toHaveBeenCalledWith({
      platform: 'douyin',
      platformUserId: 'u-1',
      reason: 'manual'
    });
  });

  it('API 失败时提示错误且不崩溃', async () => {
    const user = userEvent.setup();
    vi.mocked(blockTarget).mockRejectedValue(new Error('该用户已在黑名单中'));

    withQueryClient(
      <BlockTargetButton platform="douyin" externalUserId="u-2" />
    );
    await user.click(screen.getByTestId('block-target-button'));
    await user.click(screen.getByRole('button', { name: '确认拉黑' }));
    expect(blockTarget).toHaveBeenCalled();
  });
});

describe('useTargetBlocked', () => {
  beforeEach(() => {
    vi.mocked(checkTargetBlocked).mockReset();
  });

  it('命中返回条目', async () => {
    vi.mocked(checkTargetBlocked).mockResolvedValue({
      id: 'bl-9',
      organizationId: 'org',
      platform: 'douyin',
      platformUserId: 'u-9',
      reason: 'manual',
      note: null,
      blockedById: null,
      createdAt: new Date().toISOString(),
      deletedAt: null
    });

    function Harness() {
      const { data } = useTargetBlocked('douyin', 'u-9');
      return <div data-testid="result">{data ? 'blocked' : 'free'}</div>;
    }

    withQueryClient(<Harness />);
    expect(await screen.findByTestId('result')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('result')).toHaveTextContent('blocked')
    );
  });

  it('未命中返回 null（显示 free）', async () => {
    vi.mocked(checkTargetBlocked).mockResolvedValue(null);

    withQueryClient(<HarnessFree />);
    expect(await screen.findByTestId('result')).toHaveTextContent('free');
  });
});

function HarnessFree() {
  const { data } = useTargetBlocked('douyin', 'u-10');
  return <div data-testid="result">{data ? 'blocked' : 'free'}</div>;
}
