'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { authToken } from '@/lib/api/client';
import { hiddenSectionPrefixes } from './navigation';

const PUBLIC_PATHS = ['/login'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isHiddenSection = hiddenSectionPrefixes.some((prefix) => pathname.startsWith(prefix));

  useEffect(() => {
    if (!isPublic && !authToken.get()) {
      router.replace('/login');
    } else if (!isPublic && isHiddenSection) {
      router.replace('/dashboard');
    } else {
      setReady(true);
    }
  }, [isHiddenSection, isPublic, router]);

  if (isPublic) {
    return <>{children}</>;
  }

  if (!ready) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
      </div>
    </div>
  );
}
