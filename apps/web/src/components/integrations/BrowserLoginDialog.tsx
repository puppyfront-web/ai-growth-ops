'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Download, ExternalLink } from 'lucide-react';
import {
  cancelBrowserLogin,
  getBrowserLoginStatus,
  startBrowserLogin
} from '@/lib/api/integrations';
import { platformLabels } from '@/lib/constants';
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
  | 'waiting_local_bridge'
  | 'waiting_user'
  | 'logged_in'
  | 'cancelled'
  | 'expired'
  | 'error';

const POLL_INTERVAL_MS = 2_000;

export function BrowserLoginDialog({
  accountId,
  platform,
  open,
  onClose
}: BrowserLoginDialogProps) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<LoginState>('idle');
  const [launchUrl, setLaunchUrl] = useState('');
  const [installerUrl, setInstallerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const openAssistant = useCallback((url: string) => {
    if (!url) return;
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.src = url;
    document.body.appendChild(frame);
    window.setTimeout(() => frame.remove(), 2_000);
  }, []);

  const begin = useCallback(async () => {
    stopPolling();
    setState('starting');
    setError(null);
    setIsCancelling(false);
    setLaunchUrl('');
    setInstallerUrl(null);
    try {
      const session = await startBrowserLogin(accountId);
      activeRef.current = true;
      setLaunchUrl(session.launchUrl);
      setInstallerUrl(session.installerUrl ?? null);
      setState('waiting_local_bridge');
      openAssistant(session.launchUrl);
      pollRef.current = setInterval(async () => {
        try {
          const status = await getBrowserLoginStatus(accountId);
          if (status.status === 'waiting_local_bridge') {
            setState('waiting_local_bridge');
          } else if (status.status === 'waiting_user') {
            setState('waiting_user');
          } else if (status.status === 'logged_in') {
            activeRef.current = false;
            stopPolling();
            setState('logged_in');
            queryClient.invalidateQueries({ queryKey: ['platform-accounts'] });
          } else {
            activeRef.current = false;
            stopPolling();
            setState(status.status);
            setError(status.error ?? '授权失败，请重新授权');
          }
        } catch {
          // 短时网络抖动不终止本地浏览器中的人工授权。
        }
      }, POLL_INTERVAL_MS);
    } catch (reason) {
      activeRef.current = false;
      setState('error');
      setError(reason instanceof Error ? reason.message : '无法创建授权会话');
    }
  }, [accountId, openAssistant, queryClient, stopPolling]);

  useEffect(() => {
    if (!open) {
      stopPolling();
      activeRef.current = false;
      setState('idle');
      return;
    }
    void begin();
    return stopPolling;
  }, [begin, open, stopPolling]);

  const handleClose = useCallback(async () => {
    const shouldCancel = activeRef.current;
    activeRef.current = false;
    stopPolling();
    if (!shouldCancel) {
      onClose();
      return;
    }
    setIsCancelling(true);
    try {
      await cancelBrowserLogin(accountId);
      onClose();
    } catch (reason) {
      setState('error');
      setError(reason instanceof Error ? reason.message : '取消授权失败，请重试');
    } finally {
      setIsCancelling(false);
    }
  }, [accountId, onClose, stopPolling]);

  if (!open) return null;
  const platformName =
    platformLabels[platform as keyof typeof platformLabels] ?? platform;
  const waiting =
    state === 'waiting_local_bridge' || state === 'waiting_user';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-background p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <PlatformIcon platform={platform} className="h-7 w-7" />
          <h3 className="text-lg font-semibold">
            {platformName} · 浏览器授权
          </h3>
        </div>

        {state === 'starting' && (
          <div className="flex flex-col items-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="mt-3 text-sm text-muted-foreground">
              正在创建安全授权会话
            </p>
          </div>
        )}

        {waiting && (
          <div className="space-y-4 py-2">
            <div>
              <p className="font-medium">
                {state === 'waiting_local_bridge'
                  ? '正在打开浏览器助手'
                  : `请在 ${platformName} 网页完成授权`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                浏览器助手会打开真实登录页。请按网页提示扫码、选择验证方式或输入验证码。
              </p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              {state === 'waiting_local_bridge'
                ? '如果没有自动打开，请确认已安装浏览器助手后重试。'
                : '浏览器助手已连接，完成网页验证后会自动返回。'}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => openAssistant(launchUrl)} disabled={!launchUrl}>
                <ExternalLink className="mr-2 h-4 w-4" />
                重新打开浏览器助手
              </Button>
              {installerUrl && (
                <Button variant="outline" asChild>
                  <a href={installerUrl} target="_blank" rel="noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    下载安装浏览器助手
                  </a>
                </Button>
              )}
            </div>
            <details className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">
                首次打开被 macOS 提示「无法验证」？
              </summary>
              <p className="mt-2 leading-relaxed">
                安装包尚未通过 Apple 公证，首次打开会被系统拦截。前往
                系统设置 → 隐私与安全性，在「安全性」区域找到关于
                BrowserAssistant 的提示，点按「仍要打开」，然后回到本页重新打开助手。
              </p>
            </details>
            <p className="text-xs text-muted-foreground">
              授权在本机完成，系统不会自动处理或规避平台验证码。
            </p>
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => void handleClose()}
                disabled={isCancelling}
              >
                {isCancelling ? '取消中…' : '取消授权'}
              </Button>
            </div>
          </div>
        )}

        {state === 'logged_in' && (
          <div className="flex flex-col items-center gap-2 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <Check className="h-8 w-8 text-success" />
            </div>
            <p className="mt-2 text-base font-semibold text-success">
              授权完成
            </p>
            <p className="text-center text-xs text-muted-foreground">
              登录凭据已筛选并加密保存。真实平台能力仍以账号健康检查结果为准。
            </p>
            <Button variant="outline" onClick={handleClose} className="mt-3">
              完成
            </Button>
          </div>
        )}

        {(state === 'cancelled' || state === 'expired' || state === 'error') && (
          <div className="flex flex-col items-center py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-2xl text-destructive">
              ×
            </div>
            <p className="mt-3 text-sm font-medium text-destructive">
              {error ?? '授权失败，请重新授权'}
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => void begin()}>重新授权</Button>
              <Button variant="outline" onClick={handleClose}>
                关闭
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
