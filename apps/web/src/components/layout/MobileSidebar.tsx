'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandMark, SidebarNavContent } from './Sidebar';
import { Button } from '@/components/ui/button';

type MobileSidebarProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * md 以下的侧边栏：off-canvas 抽屉（docs/ui-ux-upgrade-plan.md A3）。
 * 桌面端由常驻 Sidebar 承担，两者共用 SidebarNavContent。
 */
export function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const prevPathname = useRef(pathname);

  // 仅在路由真正变化时关闭（挂载时不触发，否则抽屉打开即被关闭）
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      onClose();
    }
  }, [pathname, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="md:hidden" role="dialog" aria-modal="true" aria-label="导航菜单">
      <div
        className="fixed inset-0 z-40 bg-foreground/40 animate-in fade-in-0"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        className={cn(
          'fixed bottom-0 left-0 top-0 z-50 flex w-60 flex-col border-r bg-background shadow-xl',
          'animate-in slide-in-from-left duration-200'
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <BrandMark />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="关闭菜单"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <SidebarNavContent onNavigate={onClose} />
      </div>
    </div>
  );
}
