'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWecomConfig, updateWecomConfig } from '@/lib/api/integrations';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { formatDate } from '@/lib/utils';
import { useState, useEffect } from 'react';

export default function WecomPage() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ['wecom-config'],
    queryFn: getWecomConfig
  });
  const [corpId, setCorpId] = useState('');
  const [agentId, setAgentId] = useState('');

  useEffect(() => {
    if (config) {
      setCorpId(String(config.corpId ?? ''));
      setAgentId(String(config.agentId ?? ''));
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: () => updateWecomConfig({ corpId, agentId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wecom-config'] })
  });

  if (isLoading) return <LoadingState />;

  const c = config ?? {};

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="企微配置"
        description="配置企业微信客户联系和销售成员"
      />
      <div className="max-w-2xl space-y-6">
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="font-semibold">应用配置</h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">企业 ID</label>
              <input
                value={corpId}
                onChange={(e) => setCorpId(e.target.value)}
                className="mt-1 w-full rounded-md border p-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">应用 Agent ID</label>
              <input
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="mt-1 w-full rounded-md border p-2 text-sm"
              />
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">启用状态</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}
            >
              {c.enabled ? '已启用' : '未启用'}
            </span>
          </div>
          {typeof c.lastSyncAt === 'string' && (
            <div className="text-sm text-muted-foreground">
              最近同步: {formatDate(c.lastSyncAt)}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button className="rounded-md border px-4 py-2 text-sm hover:bg-accent">
            测试连接
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saveMutation.isPending ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  );
}
