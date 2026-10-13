'use client';

import { cn } from '@/lib/utils';
import { GlobalSearch } from '@/components/shared/GlobalSearch';
import { NotificationBell } from '@/components/shared/NotificationBell';
import { UserMenu } from '@/components/shared/UserMenu';
import { useTheme } from '@/providers/ThemeProvider';
import { Sun, Moon, Menu } from 'lucide-react';

type TopbarProps = {
  /** md 以下打开侧栏抽屉 */
  onOpenMobileNav?: () => void;
};

export function Topbar({ onOpenMobileNav }: TopbarProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isMocking =
    typeof window !== 'undefined' &&
    process.env.NEXT_PUBLIC_API_MOCKING === 'enabled';
  const envLabel = isMocking ? 'Mock' : 'Live';

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:px-6">
      <div
        className="flex min-w-0 items-center gap-3"
        data-user-guide-tour="global-search"
      >
        {onOpenMobileNav && (
          <button
            onClick={onOpenMobileNav}
            aria-label="打开导航菜单"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <GlobalSearch />
        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              isMocking ? 'bg-warning' : 'bg-success'
            )}
          />
          {envLabel}
        </span>
      </div>
      <div
        className="flex shrink-0 items-center gap-2 md:gap-3"
        data-user-guide-tour="topbar-actions"
      >
        <button
          onClick={toggleTheme}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={
            resolvedTheme === 'light' ? '切换暗色模式' : '切换亮色模式'
          }
        >
          {resolvedTheme === 'light' ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </button>
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
