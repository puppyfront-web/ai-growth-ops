import type { Metadata } from 'next';
import '@fontsource-variable/inter';
import './globals.css';
import { QueryProvider } from '@/providers/QueryProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { getThemeBootstrapScript } from '@/lib/theme-bootstrap';
import { AuthProvider } from '@/providers/AuthProvider';
import { ToastContainer } from '@/components/ui/toast';

export const metadata: Metadata = {
  title: 'AI Growth Ops',
  description: 'AI 全域内容获客运营系统'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 首帧前解析主题，避免暗色模式闪白（docs/ui-ux-upgrade-plan.md A3） */}
        <script
          dangerouslySetInnerHTML={{ __html: getThemeBootstrapScript() }}
        />
      </head>
      <body>
        <QueryProvider>
          <ThemeProvider>
            <AuthProvider>
              {children}
              <ToastContainer />
            </AuthProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
