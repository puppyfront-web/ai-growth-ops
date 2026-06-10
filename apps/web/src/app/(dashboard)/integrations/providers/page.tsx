'use client';

import { useQuery } from '@tanstack/react-query';
import { getProviders, type ProviderInfo } from '@/lib/api/integrations';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';

export default function ProvidersPage() {
  const { data: providers, isLoading } = useQuery({
    queryKey: ['providers'],
    queryFn: getProviders
  });

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="Provider 配置"
        description="查看各 Provider 的运行统计"
      />
      {providers && providers.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider: ProviderInfo) => (
            <div key={`${provider.name}-${provider.operation}`} className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">{provider.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700">
                  {provider.operation}
                </span>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>运行次数: {provider.runCount}</div>
                <div>平均耗时: {provider.avgDurationMs}ms</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          暂无 Provider 运行记录
        </div>
      )}
    </div>
  );
}
