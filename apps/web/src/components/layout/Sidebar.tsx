'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/hooks/use-app-store';
import { navItems } from './navigation';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider
} from '@/components/ui/tooltip';

export type SidebarNavContentProps = {
  /** 移动端抽屉中点击链接后需要关闭抽屉 */
  onNavigate?: () => void;
  collapsed?: boolean;
};

/** 侧栏导航内容：桌面 Sidebar 与移动端抽屉共用 */
export function SidebarNavContent({
  onNavigate,
  collapsed = false
}: SidebarNavContentProps) {
  const pathname = usePathname();
  const visibleItems = navItems.filter((item) => !item.hidden);

  // 按 group 分组保持原有出现顺序，未标注组的项归入最后
  const groups: { name: string | null; items: typeof visibleItems }[] = [];
  for (const item of visibleItems) {
    const name = item.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.name === name) {
      last.items.push(item);
    } else {
      groups.push({ name, items: [item] });
    }
  }

  const renderLink = (item: (typeof visibleItems)[number]) => {
    const isActive = pathname.startsWith(item.href);

    const link = (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        data-user-guide-tour={`nav-${item.href}`}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          collapsed && 'justify-center px-2'
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.href}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      );
    }

    return link;
  };

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-2">
      {groups.map((group, gi) => (
        <div key={group.name ?? `g${gi}`} className="mb-1">
          {!collapsed && group.name && (
            <div className="px-3 pb-1 pt-3 text-xs font-medium text-muted-foreground/70">
              {group.name}
            </div>
          )}
          <div className="space-y-0.5">{group.items.map(renderLink)}</div>
        </div>
      ))}
    </nav>
  );
}

export function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <Link
        href="/dashboard"
        className="mx-auto flex h-5 w-5 items-center justify-center rounded-md bg-foreground"
        aria-label="AI Growth Ops"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      </Link>
    );
  }
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="relative flex h-5 w-5 items-center justify-center rounded-md bg-foreground"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      </span>
      <span className="text-base font-semibold tracking-tight">
        AI Growth Ops
      </span>
    </Link>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useAppStore();

  return (
    <TooltipProvider>
      <aside
        data-user-guide-tour="sidebar"
        className={cn(
          'hidden flex-col border-r bg-background transition-all duration-200 md:flex',
          sidebarCollapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* Logo area */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          <BrandMark collapsed={sidebarCollapsed} />
        </div>

        {/* Navigation, grouped */}
        <SidebarNavContent collapsed={sidebarCollapsed} />

        {/* Collapse toggle at bottom */}
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'w-full',
              sidebarCollapsed ? 'justify-center' : 'justify-start'
            )}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                <span>收起侧栏</span>
              </>
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
