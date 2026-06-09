'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

export default function DashboardError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            页面加载失败
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {error.message || '遇到了意外错误，请尝试重新加载。'}
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={reset} variant="outline" size="sm">
            <RotateCcw className="mr-2 h-4 w-4" />
            重试
          </Button>
          <Button
            onClick={() => (window.location.href = '/dashboard')}
            size="sm"
          >
            <Home className="mr-2 h-4 w-4" />
            返回工作台
          </Button>
        </div>
      </div>
    </div>
  );
}
