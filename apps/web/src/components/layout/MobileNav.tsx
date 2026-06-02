'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FileText, Send, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { getUnreadCount } from '@/lib/api/notifications';

const navItems = [
  { href: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { href: '/content', label: '内容', icon: FileText },
  { href: '/publish/queue', label: '发布', icon: Send },
  { href: '/notifications', label: '通知', icon: Bell },
];

/**
 * Mobile bottom navigation bar.
 * Only visible on screens < md (768px).
 */
export function MobileNav() {
  const pathname = usePathname();
  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const unreadCount = unreadData?.count ?? 0;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background md:hidden safe-area-pb">
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 px-3 py-1 text-xs transition-colors relative',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <div className="relative">
                <item.icon className="h-5 w-5" />
                {item.href === '/notifications' && unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-bold text-white">
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
