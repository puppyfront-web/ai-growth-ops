import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserLoginDialog } from '@/components/integrations/BrowserLoginDialog';
import {
  cancelBrowserLogin,
  getBrowserLoginStatus,
  startBrowserLogin
} from '@/lib/api/integrations';

vi.mock('@/lib/api/integrations', () => ({
  startBrowserLogin: vi.fn(),
  getBrowserLoginStatus: vi.fn(),
  cancelBrowserLogin: vi.fn()
}));

function renderDialog(onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={queryClient}>
      <BrowserLoginDialog
        accountId="account-1"
        platform="douyin"
        open
        onClose={onClose}
      />
    </QueryClientProvider>
  );
  return { onClose };
}

describe('BrowserLoginDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.querySelectorAll('iframe').forEach((frame) => frame.remove());
    vi.mocked(startBrowserLogin).mockResolvedValue({
      sessionId: 'session-1',
      status: 'waiting_local_bridge',
      expiresAt: '2026-10-21T10:00:00.000Z',
      launchUrl:
        'aigrowthops://authorize?api=https%3A%2F%2Fops.example.com&session=session-1&token=bridge-token',
      installerUrl: 'https://downloads.example.com/browser-assistant'
    });
    vi.mocked(getBrowserLoginStatus).mockResolvedValue({
      status: 'waiting_local_bridge',
      expiresAt: '2026-10-21T10:00:00.000Z'
    });
    vi.mocked(cancelBrowserLogin).mockResolvedValue({ ok: true });
  });

  it('automatically opens the installed assistant without exposing commands or tokens', async () => {
    renderDialog();

    expect(await screen.findByText('正在打开浏览器助手')).toBeInTheDocument();
    expect(screen.queryByText(/pnpm browser-bridge:login/)).not.toBeInTheDocument();
    expect(screen.queryByText(/bridge-token/)).not.toBeInTheDocument();
    expect(screen.queryByText(/实时画面/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/验证码/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '下载安装浏览器助手' })).toHaveAttribute(
      'href',
      'https://downloads.example.com/browser-assistant'
    );
    expect(document.querySelector('iframe')?.getAttribute('src')).toMatch(
      /^aigrowthops:\/\/authorize\?/
    );
  });

  it('lets the user retry opening the assistant with one click', async () => {
    renderDialog();
    await screen.findByText('正在打开浏览器助手');

    fireEvent.click(screen.getByRole('button', { name: '重新打开浏览器助手' }));

    expect(document.querySelectorAll('iframe')).toHaveLength(2);
  });

  it('cancels the persisted authorization session when closed', async () => {
    const { onClose } = renderDialog();
    await screen.findByText('正在打开浏览器助手');
    fireEvent.click(screen.getByRole('button', { name: '取消授权' }));

    await waitFor(() => {
      expect(cancelBrowserLogin).toHaveBeenCalledWith('account-1');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('keeps the dialog open and shows a recoverable error when cancellation fails', async () => {
    vi.mocked(cancelBrowserLogin).mockRejectedValue(new Error('取消授权请求失败'));
    const { onClose } = renderDialog();
    await screen.findByText('正在打开浏览器助手');

    fireEvent.click(screen.getByRole('button', { name: '取消授权' }));

    expect(
      await screen.findByText('取消授权请求失败')
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('BrowserLoginDialog first-open guidance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.querySelectorAll('iframe').forEach((frame) => frame.remove());
    vi.mocked(startBrowserLogin).mockResolvedValue({
      sessionId: 'session-1',
      status: 'waiting_local_bridge',
      expiresAt: '2026-10-21T10:00:00.000Z',
      launchUrl:
        'aigrowthops://authorize?api=https%3A%2F%2Fops.example.com&session=session-1&token=bridge-token',
      installerUrl: 'https://downloads.example.com/browser-assistant'
    });
    vi.mocked(getBrowserLoginStatus).mockResolvedValue({
      status: 'waiting_local_bridge',
      expiresAt: '2026-10-21T10:00:00.000Z'
    });
    vi.mocked(cancelBrowserLogin).mockResolvedValue({ ok: true });
  });

  it('shows the macOS first-open unblock steps near the install entry', async () => {
    renderDialog();
    await screen.findByText('正在打开浏览器助手');

    expect(
      screen.getByText(/系统设置 → 隐私与安全性/)
    ).toBeInTheDocument();
    expect(screen.getByText(/仍要打开/)).toBeInTheDocument();
  });
});
