'use client';

import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** 窄屏下的潜客详情覆盖层：Esc 关闭，关闭后焦点自然归还列表行。 */
export function MobileDetailOverlay({
  children,
  onClose
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/50 sm:items-center sm:justify-center sm:p-4 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="潜客详情"
    >
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-lg bg-background p-3 sm:rounded-lg">
        <div className="mb-2 flex justify-end">
          <Button type="button" size="xs" variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
