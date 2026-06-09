'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">出了点问题</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            页面遇到了意外错误，请尝试刷新页面或返回工作台。
          </p>
          {error.message && (
            <p className="mt-3 rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground">
              {error.message}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <Button onClick={reset} variant="outline">
            <RotateCcw className="mr-2 h-4 w-4" />
            重试
          </Button>
          <Button onClick={() => (window.location.href = '/dashboard')}>
            <Home className="mr-2 h-4 w-4" />
            返回工作台
          </Button>
        </div>
      </div>
    </div>
  );
}
