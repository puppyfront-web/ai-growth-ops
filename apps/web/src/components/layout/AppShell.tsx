'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { hiddenSectionPrefixes } from './navigation';

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isHiddenSection = hiddenSectionPrefixes.some((prefix) => pathname.startsWith(prefix));

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

  // Redirect hidden sections
  if (!isPublic && isHiddenSection) {
    if (typeof window !== 'undefined') {
      router.replace('/dashboard');
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
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
      </div>
    </div>
  );
}
