'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  startBrowserLogin,
  getBrowserLoginStatus,
  cancelBrowserLogin,
  interactWithBrowserLogin,
  getScreencastTicket
} from '@/lib/api/integrations';
import { platformLabels } from '@/lib/constants';
import { Check } from 'lucide-react';
import { PlatformIcon } from '@/components/shared/PlatformIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface BrowserLoginDialogProps {
  accountId: string;
  platform: string;
  open: boolean;
  onClose: () => void;
}

type LoginState =
  | 'idle'
  | 'starting'
  | 'waiting_scan'
  | 'logged_in'
  | 'expired'
  | 'error';

const POLL_INTERVAL = 3000;
const TIMEOUT_SECONDS = 180;
/** 实时流超过这个时间没有新帧，才允许用轮询截图兜底。 */
const STREAM_STALE_MS = 5000;
// runner 无头页面的视口大小（截图按此坐标系换算点击/拖拽位置）
const PAGE_VIEWPORT = { width: 1280, height: 900 };

export function BrowserLoginDialog({
  accountId,
  platform,
  open,
  onClose
}: BrowserLoginDialogProps) {
  const qc = useQueryClient();
  const [state, setState] = useState<LoginState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [verifyText, setVerifyText] = useState('');
  const [interacting, setInteracting] = useState(false);
  const [countdown, setCountdown] = useState(TIMEOUT_SECONDS);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionActiveRef = useRef(false);
  const pointerStartRef = useRef<{
    clientX: number;
    clientY: number;
    px: number;
    py: number;
  } | null>(null);

  const resetInteraction = useCallback(() => {
    setPageImage(null);
    setVerifyText('');
    setInteracting(false);
    pointerStartRef.current = null;
  }, []);

  const sseActiveRef = useRef(false);
  const lastStreamFrameAtRef = useRef(0);
  /** 轮询代次：切换会话/关闭弹窗后，丢弃仍在途的旧响应。 */
  const pollGenerationRef = useRef(0);

  // CDP screencast 实时流：比轮询截图流畅得多；断流时自动回退到轮询 pageImage
  useEffect(() => {
    if (state !== 'waiting_scan' || !open) {
      sseActiveRef.current = false;
      lastStreamFrameAtRef.current = 0;
      return;
    }
    let cancelled = false;
    let es: EventSource | null = null;
    (async () => {
      try {
        const { ticket } = await getScreencastTicket(accountId);
        if (cancelled) return;
        es = new EventSource(
          `/api/accounts/${accountId}/browser-login/screencast?ticket=${encodeURIComponent(ticket)}`
        );
        es.addEventListener('open', () => {
          sseActiveRef.current = true;
        });
        es.addEventListener('frame', (ev) => {
          const { frame } = JSON.parse((ev as MessageEvent).data);
          if (!frame) return;
          sseActiveRef.current = true;
          lastStreamFrameAtRef.current = Date.now();
          setPageImage(frame);
        });
        es.onerror = () => {
          // EventSource 自动重连；持续失败则 sseActive 保持 false 走轮询兜底
          sseActiveRef.current = false;
        };
      } catch {
        /* 拿不到票据时走轮询兜底 */
      }
    })();
    return () => {
      cancelled = true;
      sseActiveRef.current = false;
      lastStreamFrameAtRef.current = 0;
      es?.close();
    };
  }, [state, open, accountId]);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    pollGenerationRef.current += 1;
  }, []);

  /** 实时流是否仍在持续出帧（用最近一帧时间判断，而不是只看连接状态）。 */
  const isStreamHealthy = useCallback(
    () =>
      sseActiveRef.current &&
      Date.now() - lastStreamFrameAtRef.current < STREAM_STALE_MS,
    []
  );

  const startPolling = useCallback(
    (targetAccountId: string) => {
      const generation = pollGenerationRef.current;
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            cleanup();
            sessionActiveRef.current = false;
            setState('expired');
            setError('登录超时');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      pollRef.current = setInterval(async () => {
        if (generation !== pollGenerationRef.current) return;
        try {
          const status = await getBrowserLoginStatus(targetAccountId);
          if (generation !== pollGenerationRef.current) return;
          if (status.qrImage) setQrImage(status.qrImage);
          // 只在实时流已经断掉/卡住时才用轮询截图兜底；
          // 否则两路画面会互相覆盖，看起来就是内容来回切换。
          if (status.pageImage && !isStreamHealthy()) {
            setPageImage(status.pageImage);
          }

          if (status.status === 'logged_in') {
            cleanup();
            sessionActiveRef.current = false;
            setState('logged_in');
            qc.invalidateQueries({ queryKey: ['platform-accounts'] });
            // Auto-close dialog after user sees the success state (2.5s)
            setTimeout(() => {
              onClose();
            }, 2500);
          } else if (status.status === 'expired') {
            cleanup();
            sessionActiveRef.current = false;
            setState('expired');
            setError(status.error ?? '二维码已过期');
          } else if (status.status === 'error') {
            cleanup();
            sessionActiveRef.current = false;
            setState('error');
            setError(status.error ?? '登录失败');
          }
        } catch {
          // poll error - keep trying
        }
      }, POLL_INTERVAL);
    },
    [cleanup, isStreamHealthy, qc]
  );

  const handleClose = useCallback(() => {
    cleanup();
    const shouldCancel = sessionActiveRef.current;
    sessionActiveRef.current = false;
    setState('idle');
    setError(null);
    setQrImage(null);
    resetInteraction();
    onClose();
    if (shouldCancel) {
      cancelBrowserLogin(accountId).catch(() => {});
    }
  }, [accountId, cleanup, onClose, resetInteraction]);

  // 把画面上的点击/拖拽换算为登录页坐标（截图 1280×900 视口）并转发执行
  const toPageCoords = (e: React.PointerEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * PAGE_VIEWPORT.width);
    const y = Math.round(
      ((e.clientY - rect.top) / rect.height) * PAGE_VIEWPORT.height
    );
    return {
      x: Math.min(Math.max(x, 0), PAGE_VIEWPORT.width),
      y: Math.min(Math.max(y, 0), PAGE_VIEWPORT.height)
    };
  };

  const handlePagePointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    e.preventDefault();
    const pt = toPageCoords(e);
    pointerStartRef.current = { clientX: e.clientX, clientY: e.clientY, px: pt.x, py: pt.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePagePointerUp = async (e: React.PointerEvent<HTMLImageElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || !sessionActiveRef.current) return;
    const cur = toPageCoords(e);
    const movedPx = Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY);
    setInteracting(true);
    try {
      if (movedPx > 10) {
        await interactWithBrowserLogin(accountId, {
          action: 'drag',
          fromX: start.px,
          fromY: start.py,
          toX: cur.x,
          toY: cur.y
        });
      } else {
        await interactWithBrowserLogin(accountId, { action: 'click', x: cur.x, y: cur.y });
      }
    } finally {
      setInteracting(false);
    }
  };

  const sendVerifyText = async () => {
    if (!verifyText.trim() || !sessionActiveRef.current) return;
    setInteracting(true);
    try {
      await interactWithBrowserLogin(accountId, { action: 'type', text: verifyText });
      setVerifyText('');
    } finally {
      setInteracting(false);
    }
  };

  const sendEnter = async () => {
    if (!sessionActiveRef.current) return;
    setInteracting(true);
    try {
      await interactWithBrowserLogin(accountId, { action: 'key', key: 'Enter' });
    } finally {
      setInteracting(false);
    }
  };

  const handleRetry = useCallback(async () => {
    cleanup();
    sessionActiveRef.current = false;
    setState('starting');
    setError(null);
    setQrImage(null);
    resetInteraction();
    setCountdown(TIMEOUT_SECONDS);
    try {
      const start = await startBrowserLogin(accountId);
      setQrImage(start.qrImage ?? null);
      sessionActiveRef.current = true;
      setState('waiting_scan');
      startPolling(accountId);
    } catch (err) {
      sessionActiveRef.current = false;
      setState('error');
      setError((err as Error).message ?? '启动登录失败');
    }
  }, [accountId, cleanup, resetInteraction, startPolling]);

  useEffect(() => {
    if (!open) {
      // Don't wipe state if we're in logged_in — let the success screen stay
      // visible until the auto-close timer fires (or user clicks 完成).
      if (state !== 'logged_in') {
        sessionActiveRef.current = false;
        cleanup();
        setState('idle');
        setError(null);
        setQrImage(null);
        resetInteraction();
        setCountdown(TIMEOUT_SECONDS);
      }
      return;
    }

    let cancelled = false;

    (async () => {
      setState('starting');
      setError(null);
      setQrImage(null);
      resetInteraction();
      setCountdown(TIMEOUT_SECONDS);
      try {
        const start = await startBrowserLogin(accountId);
        if (cancelled) return;
        setQrImage(start.qrImage ?? null);
        sessionActiveRef.current = true;
        setState('waiting_scan');
        startPolling(accountId);
      } catch (err) {
        if (cancelled) return;
        sessionActiveRef.current = false;
        setState('error');
        setError((err as Error).message ?? '启动登录失败');
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [open, accountId, cleanup, resetInteraction, startPolling]);

  // Keep rendering during logged_in so the success screen is visible
  if (!open && state !== 'logged_in') return null;

  const platformName =
    platformLabels[platform as keyof typeof platformLabels] ?? platform;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <PlatformIcon platform={platform} className="h-7 w-7" />
          <h3 className="text-lg font-semibold">{platformName} · 扫码登录</h3>
        </div>

        {state === 'starting' && (
          <div className="flex flex-col items-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="mt-3 text-sm text-muted-foreground">
              正在启动浏览器...
            </p>
          </div>
        )}

        {state === 'waiting_scan' && (
          <div className="flex flex-col items-center py-6">
            <div className="rounded-xl border bg-white p-2">
              {qrImage ? (
                <img
                  src={qrImage}
                  alt={`${platformName} 登录二维码`}
                  className="h-52 w-52 object-contain"
                />
              ) : (
                <div className="flex h-52 w-52 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              )}
            </div>
            <p className="mt-3 text-sm font-medium">
              请使用 {platformName} App 扫描二维码登录
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              二维码过期后会自动刷新；若长时间未更新请点击重新登录
            </p>

            {/* 实时画面：扫码后如出现滑块/验证码等二次验证，直接在画面上远程操作 */}
            <div className="mt-4 w-full">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium">
                  出现滑块/验证码？直接在下方画面操作
                </p>
                {interacting && (
                  <span className="text-xs text-muted-foreground">执行中…</span>
                )}
              </div>
              <div className="rounded-lg border overflow-hidden bg-white">
                {pageImage ? (
                  <img
                    src={pageImage}
                    alt="登录页实时画面"
                    draggable={false}
                    className="w-full block cursor-crosshair touch-none select-none"
                    onPointerDown={handlePagePointerDown}
                    onPointerUp={handlePagePointerUp}
                  />
                ) : (
                  <div className="h-28 flex items-center justify-center text-xs text-muted-foreground">
                    正在加载实时画面…
                  </div>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  value={verifyText}
                  onChange={(e) => setVerifyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendVerifyText();
                  }}
                  placeholder="点击画面中的输入框后，在此输入验证码"
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  className="h-8"
                  disabled={interacting || !verifyText.trim()}
                  onClick={sendVerifyText}
                >
                  输入
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={interacting}
                  onClick={sendEnter}
                >
                  回车
                </Button>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              剩余 {Math.floor(countdown / 60)}:
              {(countdown % 60).toString().padStart(2, '0')}
            </p>
          </div>
        )}

        {state === 'logged_in' && (
          <div className="flex flex-col items-center py-8 gap-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <Check className="h-8 w-8 text-success" />
            </div>
            <p className="mt-2 text-base font-semibold text-success">
              登录成功！Cookie 已加密保存
            </p>
            <p className="text-xs text-muted-foreground text-center">
              账号状态已更新为「已授权」，现在可以执行获客任务了
            </p>
            <p className="text-xs text-muted-foreground">窗口将自动关闭…</p>
            <Button
              variant="outline"
              onClick={handleClose}
              className="mt-3 border-success/40 text-success hover:bg-success/10 hover:text-success"
            >
              完成
            </Button>
          </div>
        )}

        {(state === 'expired' || state === 'error') && (
          <div className="flex flex-col items-center py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <span className="text-2xl text-destructive">✗</span>
            </div>
            <p className="mt-3 text-sm font-medium text-destructive">
              {error ?? '登录失败'}
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={handleRetry}>重新登录</Button>
              <Button variant="outline" onClick={handleClose}>
                关闭
              </Button>
            </div>
          </div>
        )}

        {state === 'waiting_scan' && (
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={handleClose}>
              取消
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
