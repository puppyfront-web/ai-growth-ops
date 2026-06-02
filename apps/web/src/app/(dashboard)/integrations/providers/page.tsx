'use client';

import { useQuery } from '@tanstack/react-query';
import { getProviders } from '@/lib/api/integrations';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatDate } from '@/lib/utils';

const healthStyles: Record<string, string> = { healthy: 'success', warning: 'warning', error: 'danger', unknown: 'muted' };
const healthLabels: Record<string, string> = { healthy: '正常', warning: '警告', error: '异常', unknown: '未知' };

export default function ProvidersPage() {
  const { data: providers, isLoading } = useQuery({ queryKey: ['providers'], queryFn: getProviders });

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="Provider 配置" description="管理各 Provider 的启用状态和健康状态" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {providers?.map((provider: any) => (
          <div key={provider.name} className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">{provider.name}</h3>
              <StatusBadge status={healthStyles[provider.health]} label={healthLabels[provider.health]} />
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>版本: {provider.version} · 模式: {provider.mode}</div>
              <div>最近运行: {provider.lastRunAt ? formatDate(provider.lastRunAt) : '从未'}</div>
              <div>失败次数: {provider.failCount}</div>
              {provider.platforms.length > 0 && <div>关联平台: {provider.platforms.join(', ')}</div>}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${provider.enabled ? 'bg-green-50 dark:bg-green-950 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                {provider.enabled ? '已启用' : '已禁用'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
