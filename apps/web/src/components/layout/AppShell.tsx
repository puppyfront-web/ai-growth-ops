'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { Sidebar } from './Sidebar';
import { MobileSidebar } from './MobileSidebar';
import { Topbar } from './Topbar';
import { MobileNav } from './MobileNav';
import { UserGuide } from '@/components/shared/UserGuide';
import { hiddenSectionPrefixes } from './navigation';

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/accept-invite',
  '/forgot-password',
  '/reset-password',
  '/verify-email'
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isHiddenSection = hiddenSectionPrefixes.some((prefix) =>
    pathname.startsWith(prefix)
  );

  // Show nothing while auth state is loading
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  // Redirect unauthenticated users to login
  if (!isPublic && !isAuthenticated) {
    if (typeof window !== 'undefined') {
      router.replace('/login');
    }
    return null;
  }

  // Redirect hidden sections to CRM home.
  if (!isPublic && isHiddenSection) {
    if (typeof window !== 'undefined') {
      router.replace('/prospecting');
    }
    return null;
  }

  // Public pages (login) render without shell
  if (isPublic) {
    return <>{children}</>;
  }

  // Authenticated layout with sidebar + topbar
  return (
    <div className="flex h-screen overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:border focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
      >
        跳到正文
      </a>
      <Sidebar />
      <MobileSidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main
          id="main-content"
          className="flex-1 overflow-y-auto bg-muted/30 p-4 pb-20 md:p-6 md:pb-6"
        >
          {children}
        </main>
      </div>
      <MobileNav />
      <UserGuide />
    </div>
  );
}
