'use client';

import { Button } from '@/components/ui/button';
import { Home, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="text-7xl font-bold text-muted-foreground/30">404</div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">页面不存在</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            你访问的页面不存在或已被移除，请检查链接是否正确。
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() =>
              typeof window !== 'undefined' && window.history.back()
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回上页
          </Button>
          <Link href="/dashboard">
            <Button>
              <Home className="mr-2 h-4 w-4" />
              返回工作台
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
