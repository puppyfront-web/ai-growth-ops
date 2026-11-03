'use client';

import { useEffect, useRef, useState } from 'react';
import {
  cancelProspectingCaptcha,
  getProspectingCaptchaStatus,
  resolveProspectingCaptcha,
  startProspectingCaptcha
} from '@/lib/api/prospecting';
import { Button } from '@/components/ui/button';

/** 人工过码弹窗：发起本机浏览器过码会话并轮询结果，解决后回调。 */
export function CaptchaSolveDialog({
  platformAccountId,
  onClose,
  onSolved
}: {
  platformAccountId: string;
  onClose: () => void;
  onSolved: () => void;
}) {
  const [status, setStatus] = useState<
    'starting' | 'waiting' | 'solved' | 'error'
  >('starting');
  const [error, setError] = useState('');
  const onSolvedRef = useRef(onSolved);
  onSolvedRef.current = onSolved;
  const skipCancelRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const start = async () => {
      try {
        await startProspectingCaptcha(platformAccountId);
        if (cancelled) return;
        setStatus('waiting');
        timer = setInterval(async () => {
          try {
            const result = await getProspectingCaptchaStatus();
            if (cancelled) return;
            if (result.status === 'solved') {
              if (timer) clearInterval(timer);
              setStatus('solved');
              skipCancelRef.current = true;
              onSolvedRef.current();
            } else if (result.status === 'expired') {
              if (timer) clearInterval(timer);
              setStatus('error');
              setError(result.error || '过码超时，请重试或点「我已完成验证」');
            }
          } catch (err) {
            if (cancelled) return;
            if (timer) clearInterval(timer);
            setStatus('error');
            setError((err as Error).message);
          }
        }, 2500);
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setError((err as Error).message);
      }
    };
    start();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (!skipCancelRef.current) {
        cancelProspectingCaptcha().catch(() => undefined);
      }
    };
  }, [platformAccountId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="captcha-solve-title"
        className="w-full max-w-md rounded-lg border bg-background p-5 space-y-3"
      >
        <h3 id="captcha-solve-title" className="font-medium">
          完成平台验证码
        </h3>
        <p className="text-sm text-muted-foreground">
          {status === 'starting' && '正在打开本机浏览器窗口…'}
          {status === 'waiting' &&
            '请在弹出的浏览器里完成验证，完成后这里会自动解除冷却。'}
          {status === 'solved' && '验证已通过，可以继续增量执行。'}
          {status === 'error' && (error || '过码失败')}
        </p>
        <div className="flex justify-end gap-2">
          {status !== 'solved' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                skipCancelRef.current = true;
                await resolveProspectingCaptcha(platformAccountId);
                onSolved();
              }}
            >
              我已完成验证
            </Button>
          )}
          <Button type="button" size="sm" onClick={onClose}>
            {status === 'solved' ? '关闭' : '取消'}
          </Button>
        </div>
      </div>
    </div>
  );
}
