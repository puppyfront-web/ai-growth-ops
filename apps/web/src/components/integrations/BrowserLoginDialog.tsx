'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  startQrLogin,
  getQrLoginStatus,
  cancelQrLogin
} from '@/lib/api/integrations';
import { platformLabels } from '@/lib/constants';
import { Check } from 'lucide-react';
import { PlatformIcon } from '@/components/shared/PlatformIcon';
import { Button } from '@/components/ui/button';

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

/**
 * 网页内扫码登录（第 1 代交互的恢复，部署到用户机器时的默认方式）：
 * - 有显示服务的部署：browser-runner 直接弹出真实浏览器窗口展示完整登录页，
 *   用户在窗口里扫码并完成验证方式选择/短信验证码等操作，本弹窗只展示状态。
 * - 无显示服务的部署（无 DISPLAY 的容器）：自动降级为无头模式，本弹窗展示登录页二维码。
 */
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
  const [headed, setHeaded] = useState(false);
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
          const status = await getQrLoginStatus(targetAccountId);
          if (status.qrImage) setQrImage(status.qrImage);

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
    [cleanup, qc]
  );

  const handleClose = useCallback(() => {
    cleanup();
    const shouldCancel = sessionActiveRef.current;
    sessionActiveRef.current = false;
    setState('idle');
    setError(null);
    setQrImage(null);
    onClose();
    if (shouldCancel) {
      cancelQrLogin(accountId).catch(() => {});
    }
  }, [accountId, cleanup, onClose]);

  const handleRetry = useCallback(async () => {
    cleanup();
    sessionActiveRef.current = false;
    setState('starting');
    setError(null);
    setQrImage(null);
    setCountdown(TIMEOUT_SECONDS);
    try {
      const start = await startQrLogin(accountId);
      setHeaded(start.headed === true);
      setQrImage(start.qrImage ?? null);
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
      // Don't wipe state if we're in logged_in — let the success screen stay
      // visible until the auto-close timer fires (or user clicks 完成).
      if (state !== 'logged_in') {
        sessionActiveRef.current = false;
        cleanup();
        setState('idle');
        setError(null);
        setQrImage(null);
        setCountdown(TIMEOUT_SECONDS);
      }
      return;
    }

    let cancelled = false;

    (async () => {
      setState('starting');
      setError(null);
      setQrImage(null);
      setCountdown(TIMEOUT_SECONDS);
      try {
        const start = await startQrLogin(accountId);
        if (cancelled) return;
        setHeaded(start.headed === true);
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
  }, [open, accountId, cleanup, startPolling]);

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

        {state === 'waiting_scan' && headed && (
          <div className="flex flex-col items-center py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-info/10">
              <PlatformIcon platform={platform} className="h-8 w-8" />
            </div>
            <p className="mt-4 text-sm font-medium">
              请在弹出的浏览器窗口中扫码登录
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              使用 {platformName} App 扫描窗口中显示的二维码；如需选择验证方式或输入验证码，直接在该窗口中操作
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              剩余 {Math.floor(countdown / 60)}:
              {(countdown % 60).toString().padStart(2, '0')}
            </p>
          </div>
        )}

        {state === 'waiting_scan' && !headed && (
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
            <p className="mt-4 text-sm font-medium">
              请使用 {platformName} App 扫描二维码登录
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              二维码过期后会自动刷新；若长时间未更新请点击重新登录
            </p>
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
