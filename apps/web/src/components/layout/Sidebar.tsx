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

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'flex flex-col border-r bg-background transition-all duration-200',
          sidebarCollapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* Logo area */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          {!sidebarCollapsed && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-sm font-bold text-white">
                AI
              </div>
              <span className="font-semibold">AI Growth Ops</span>
            </Link>
          )}
          {sidebarCollapsed && (
            <Link
              href="/dashboard"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-sm font-bold text-white mx-auto"
            >
              AI
            </Link>
          )}
        </div>

        {/* Navigation items */}
        <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
          {visibleItems.map((item) => {
            const isActive = pathname.startsWith(item.href);

            const link = (
              <Link
                key={item.href}
                href={item.href}
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
          })}
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
