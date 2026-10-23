import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserLoginDialog } from '@/components/integrations/BrowserLoginDialog';
import {
  cancelQrLogin,
  getQrLoginStatus,
  startQrLogin
} from '@/lib/api/integrations';

vi.mock('@/lib/api/integrations', () => ({
  startQrLogin: vi.fn(),
  getQrLoginStatus: vi.fn(),
  cancelQrLogin: vi.fn()
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

const QR_DATA_URL = 'data:image/png;base64,qr-code-image';

describe('BrowserLoginDialog（第 1 代：弹出浏览器窗口扫码）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(startQrLogin).mockResolvedValue({
      sessionId: 'session-1',
      status: 'waiting_scan',
      headed: true
    });
    vi.mocked(getQrLoginStatus).mockResolvedValue({
      status: 'waiting_scan'
    });
    vi.mocked(cancelQrLogin).mockResolvedValue({ ok: true });
  });

  it('有显示服务的部署：提示在弹出的浏览器窗口中扫码，无需任何本地助手', async () => {
    renderDialog();

    expect(
      await screen.findByText('请在弹出的浏览器窗口中扫码登录')
    ).toBeInTheDocument();
    expect(startQrLogin).toHaveBeenCalledWith('account-1');
    expect(
      screen.queryByPlaceholderText(/输入验证码/)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/浏览器助手/)
    ).not.toBeInTheDocument();
  });

  it('无显示服务的部署（无 DISPLAY 容器）：降级为弹窗内展示二维码', async () => {
    vi.mocked(startQrLogin).mockResolvedValue({
      sessionId: 'session-1',
      status: 'waiting_scan',
      headed: false,
      qrImage: QR_DATA_URL
    });
    renderDialog();

    expect(
      await screen.findByText('请使用 抖音 App 扫描二维码登录')
    ).toBeInTheDocument();
    expect(
      document.querySelector('img[src^="data:image/png"]')
    ).not.toBeNull();
  });

  it('轮询到 logged_in 后展示成功态', async () => {
    // 轮询间隔 3s，用 fake timers 确定性推进，避免真实等待导致的抖动
    vi.useFakeTimers();
    try {
      vi.mocked(getQrLoginStatus)
        .mockResolvedValueOnce({ status: 'waiting_scan' })
        .mockResolvedValueOnce({ status: 'logged_in' });
      renderDialog();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText('抖音 · 扫码登录')).toBeInTheDocument();

      await act(async () => {
        // 覆盖两轮 3s 轮询：第一轮 waiting_scan，第二轮 logged_in
        await vi.advanceTimersByTimeAsync(6500);
      });
      expect(
        screen.getByText('登录成功！Cookie 已加密保存')
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('关闭弹窗时取消登录会话', async () => {
    const { onClose } = renderDialog();
    await screen.findByText('请在弹出的浏览器窗口中扫码登录');
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    await act(async () => {});
    expect(cancelQrLogin).toHaveBeenCalledWith('account-1');
    expect(onClose).toHaveBeenCalled();
  });

  it('启动失败时展示可恢复的错误', async () => {
    vi.mocked(startQrLogin).mockRejectedValueOnce(
      new Error('浏览器辅助服务不可用: 服务未启动或不可达')
    );
    renderDialog();

    expect(
      await screen.findByText(/浏览器辅助服务不可用/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新登录' })).toBeInTheDocument();
  });
});
