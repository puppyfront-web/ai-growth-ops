'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFeishuConfig, testFeishuConfig, updateFeishuConfig } from '@/lib/api/integrations';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { formatDate } from '@/lib/utils';
import { useState, useEffect } from 'react';

export default function FeishuPage() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ['feishu-config'],
    queryFn: getFeishuConfig
  });
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [appToken, setAppToken] = useState('');
  const [tableId, setTableId] = useState('');
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (config) {
      setAppId(String(config.appId ?? ''));
      setAppSecret(String(config.appSecret ?? ''));
      setAppToken(String(config.appToken ?? ''));
      setTableId(String(config.tableId ?? ''));
      setEnabled(config.enabled !== false);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateFeishuConfig({
        appId,
        appSecret,
        appToken,
        tableId,
        enabled
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feishu-config'] })
  });
  const testMutation = useMutation({
    mutationFn: () =>
      testFeishuConfig({
        appId,
        appSecret,
        appToken,
        tableId
      }),
    onSuccess: (result) => {
      if (result.success) toast.success(result.message || '连接成功');
      else toast.error(result.message || '连接失败');
    },
    onError: (err: Error) => {
      toast.error(err.message || '连接失败');
    }
  });

  if (isLoading) return <LoadingState />;

  const c = config ?? {};

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="飞书配置"
        description="客户管理写入的客户会自动同步到此表（需启用）；字段名见下方说明"
      />
      <div className="max-w-2xl space-y-6">
        <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
          建议在多维表格中创建列：
          customer_id、customer_name、channel、phone、company、role、intent、status、lead_level、segment、next_action、fit_score、intent_score、summary、assigned_to、created_at。
          同一客户会更新同一行；跟进请在飞书完成。next_action 为可选列。也可自定义 fieldMapping。
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="font-semibold">应用配置</h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">App ID</label>
              <input
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                className="mt-1 w-full rounded-md border p-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">App Secret</label>
              <input
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                className="mt-1 w-full rounded-md border p-2 text-sm"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-sm font-medium">多维表格 App Token</label>
              <input
                value={appToken}
                onChange={(e) => setAppToken(e.target.value)}
                className="mt-1 w-full rounded-md border p-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Table ID</label>
              <input
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
                className="mt-1 w-full rounded-md border p-2 text-sm"
              />
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">启用客户自动同步</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
          </label>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">当前状态</span>
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
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            {testMutation.isPending ? '测试中...' : '测试连接'}
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
