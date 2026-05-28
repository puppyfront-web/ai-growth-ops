'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const tabs = [
  { label: '全部', href: '/conversations' },
  { label: '评论管理', href: '/conversations/comments' },
  { label: '私信管理', href: '/conversations/messages' },
  { label: '回复管理', href: '/conversations/replies' },
  { label: '人工审核', href: '/conversations/review' },
];

export default function ConversationsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <div className="flex gap-1 border-b mb-6">
        {tabs.map((tab) => {
          const isActive = tab.href === '/conversations'
            ? pathname === '/conversations'
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
