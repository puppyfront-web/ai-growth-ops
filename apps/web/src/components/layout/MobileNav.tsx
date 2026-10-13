'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navItems } from './navigation';
import { getUnreadCount } from '@/lib/api/notifications';

/** 移动端底部 Tab：与 sidebar 导航同源（navigation.ts），选 5 个高频入口 */
const MOBILE_TAB_HREFS = [
  '/dashboard',
  '/prospecting',
  '/content',
  '/publish',
  '/notifications'
] as const;

/**
 * Mobile bottom navigation bar.
 * Only visible on screens < md (768px).
 */
export function MobileNav() {
  const pathname = usePathname();

  const navItemsByHref = new Map(navItems.map((item) => [item.href, item]));
  const tabs = MOBILE_TAB_HREFS.map((href) => {
    if (href === '/publish') {
      return { href, label: '发布', icon: navItemsByHref.get('/publish')!.icon };
    }
    const item = navItemsByHref.get(href);
    return item
      ? { href, label: item.label, icon: item.icon }
      : { href, label: href, icon: Bell };
  });

  // 与 NotificationBell 共享同一 queryKey，请求数据自动去重
  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
    staleTime: 15_000
  });

  const unreadCount = unreadData?.count ?? 0;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background md:hidden safe-area-pb">
      <div className="flex items-center justify-around h-14">
        {tabs.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 px-3 py-1 text-xs transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <div className="relative">
                <item.icon className="h-5 w-5" aria-hidden />
                {item.href === '/notifications' && unreadCount > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-xs leading-none text-destructive-foreground">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
