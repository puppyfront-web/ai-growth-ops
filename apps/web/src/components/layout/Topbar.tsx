'use client';

import { GlobalSearch } from '@/components/shared/GlobalSearch';
import { NotificationBell } from '@/components/shared/NotificationBell';
import { UserMenu } from '@/components/shared/UserMenu';

export function Topbar() {
  const isMocking = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_API_MOCKING === 'enabled';
  const envLabel = isMocking ? 'Mock' : 'Live';
  const envColor = isMocking ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700';

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-3">
        <GlobalSearch />
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${envColor}`}>
          {envLabel}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
