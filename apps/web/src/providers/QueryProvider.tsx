'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from '@/components/ui/toast';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
            refetchOnWindowFocus: false
          },
          mutations: {
            // 全局兜底（docs/interaction-spec.md 第 5 节）：
            // 未自行处理 onError 的 mutation 统一 toast；
            // 页面自定义了 onError 时以页面逻辑为准（TanStack 覆盖语义）。
            onError: (error) => {
              toast.error(
                error instanceof Error && error.message
                  ? error.message
                  : '操作失败，请重试'
              );
            }
          }
        }
      })
  );
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
