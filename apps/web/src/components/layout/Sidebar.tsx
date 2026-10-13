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

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useAppStore();
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
        data-user-guide-tour={`nav-${item.href}`}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          sidebarCollapsed && 'justify-center px-2'
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!sidebarCollapsed && <span>{item.label}</span>}
      </Link>
    );

    if (sidebarCollapsed) {
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
    <TooltipProvider>
      <aside
        data-user-guide-tour="sidebar"
        className={cn(
          'flex flex-col border-r bg-background transition-all duration-200',
          sidebarCollapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* Logo area */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          {!sidebarCollapsed && (
            <Link href="/prospecting" className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="relative flex h-5 w-5 items-center justify-center rounded-md bg-foreground"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              <span className="text-[15px] font-semibold tracking-tight">
                AI Growth Ops
              </span>
            </Link>
          )}
          {sidebarCollapsed && (
            <Link
              href="/prospecting"
              className="mx-auto flex h-5 w-5 items-center justify-center rounded-md bg-foreground"
              aria-label="AI Growth Ops"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            </Link>
          )}
        </div>

        {/* Navigation, grouped */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {groups.map((group, gi) => (
            <div key={group.name ?? `g${gi}`} className="mb-1">
              {!sidebarCollapsed && group.name && (
                <div className="px-3 pb-1 pt-3 text-[11px] font-medium text-muted-foreground/70">
                  {group.name}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map(renderLink)}
              </div>
            </div>
          ))}
        </nav>

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
