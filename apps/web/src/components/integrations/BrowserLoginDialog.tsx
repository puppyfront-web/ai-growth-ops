'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  startBrowserLogin,
  getBrowserLoginStatus,
  cancelBrowserLogin
} from '@/lib/api/integrations';
import { platformLabels, platformIcons } from '@/lib/constants';

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

export function BrowserLoginDialog({
  accountId,
  platform,
  open,
  onClose
}: BrowserLoginDialogProps) {
  const qc = useQueryClient();
  const [state, setState] = useState<LoginState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(TIMEOUT_SECONDS);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionActiveRef = useRef(false);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (targetAccountId: string) => {
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
        try {
          const status = await getBrowserLoginStatus(targetAccountId);

          if (status.status === 'logged_in') {
            cleanup();
            sessionActiveRef.current = false;
            setState('logged_in');
            qc.invalidateQueries({ queryKey: ['platform-accounts'] });
            // Auto-close dialog after a short delay so user sees the success state
            setTimeout(() => {
              setState('idle');
              setError(null);
              onClose();
            }, 1500);
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
    [cleanup, qc]
  );

  const handleClose = useCallback(() => {
    cleanup();
    const shouldCancel = sessionActiveRef.current;
    sessionActiveRef.current = false;
    setState('idle');
    setError(null);
    onClose();
    if (shouldCancel) {
      cancelBrowserLogin(accountId).catch(() => {});
    }
  }, [accountId, cleanup, onClose]);

  const handleRetry = useCallback(async () => {
    cleanup();
    sessionActiveRef.current = false;
    setState('starting');
    setError(null);
    setCountdown(TIMEOUT_SECONDS);
    try {
      await startBrowserLogin(accountId);
      sessionActiveRef.current = true;
      setState('waiting_scan');
      startPolling(accountId);
    } catch (err) {
      sessionActiveRef.current = false;
      setState('error');
      setError((err as Error).message ?? '启动登录失败');
    }
  }, [accountId, cleanup, startPolling]);

  useEffect(() => {
    if (!open) {
      sessionActiveRef.current = false;
      cleanup();
      setState('idle');
      setError(null);
      setCountdown(TIMEOUT_SECONDS);
      return;
    }

    let cancelled = false;

    (async () => {
      setState('starting');
      setError(null);
      setCountdown(TIMEOUT_SECONDS);
      try {
        await startBrowserLogin(accountId);
        if (cancelled) return;
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
      // Cancel the browser session if component unmounts mid-flow
      if (sessionActiveRef.current) {
        sessionActiveRef.current = false;
        cancelBrowserLogin(accountId).catch(() => {});
      }
    };
  }, [open, accountId, cleanup, startPolling]);

  if (!open) return null;

  const platformName =
    platformLabels[platform as keyof typeof platformLabels] ?? platform;
  const platformIcon =
    platformIcons[platform as keyof typeof platformIcons] ?? '🔌';

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
          <span className="text-2xl">{platformIcon}</span>
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
          <div className="flex flex-col items-center py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
              <span className="text-3xl">🌐</span>
            </div>
            <p className="mt-4 text-sm font-medium">
              请在弹出的浏览器窗口中扫码登录
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              使用 {platformName} App 扫描浏览器中显示的二维码
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              剩余 {Math.floor(countdown / 60)}:
              {(countdown % 60).toString().padStart(2, '0')}
            </p>
          </div>
        )}

        {state === 'logged_in' && (
          <div className="flex flex-col items-center py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <span className="text-2xl text-green-600">✓</span>
            </div>
            <p className="mt-3 text-sm font-medium text-green-700">
              登录成功，凭证已保存
            </p>
            <button
              onClick={handleClose}
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              完成
            </button>
          </div>
        )}

        {(state === 'expired' || state === 'error') && (
          <div className="flex flex-col items-center py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <span className="text-2xl text-red-600">✗</span>
            </div>
            <p className="mt-3 text-sm font-medium text-red-700">
              {error ?? '登录失败'}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleRetry}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                重新登录
              </button>
              <button
                onClick={handleClose}
                className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
              >
                关闭
              </button>
            </div>
          </div>
        )}

        {state === 'waiting_scan' && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleClose}
              className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
            >
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
