'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getFeishuConfig,
  testFeishuConfig,
  updateFeishuConfig
} from '@/lib/api/integrations';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/LoadingState';
import { formatDateTime } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';

export function FeishuSyncForm() {
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
    <div className="max-w-2xl space-y-6">
      <div className="rounded-xl border bg-muted/40 p-5 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <BookOpen className="h-4 w-4" />
          配置指引
        </div>
        <ol className="mt-3 list-decimal space-y-2 pl-4 text-muted-foreground">
          <li>
            在飞书开放平台创建一个企业自建应用，获取
            App&nbsp;ID&nbsp;/&nbsp;App&nbsp;Secret，并在应用中开通「多维表格」相关权限。
            <a
              href="https://open.feishu.cn/app"
              target="_blank"
              rel="noreferrer"
              className="ml-1 inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
            >
              飞书开放平台
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            创建一个多维表格作为同步目标表：浏览器地址栏 URL 中{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/base/</code>{' '}
            后的字符串就是 App Token，{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">table=</code>{' '}
            参数的值就是 Table ID。
          </li>
          <li>
            在表格中按下方的推荐列建好字段，填写配置后先「测试连接」，通过后再保存启用。
          </li>
        </ol>
        <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          推荐列：customer_id、customer_name、channel、phone、company、role、intent、status、lead_level、segment、next_action、fit_score、intent_score、summary、assigned_to、created_at。同一客户会更新同一行；跟进请在飞书完成，next_action
          为可选列，也可自定义 fieldMapping。详细字段说明见
          <a
            href="https://open.feishu.cn/document/server-docs/docs/bitable-v1/bitable-overview"
            target="_blank"
            rel="noreferrer"
            className="mx-0.5 inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
          >
            多维表格开发文档
            <ExternalLink className="h-3 w-3" />
          </a>
          。
        </div>
      </div>
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="font-semibold">应用配置</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">App ID</label>
            <input
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="cli_a5xxxxxxxxxx"
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
              placeholder="从表格 URL /base/ 后获取"
              className="mt-1 w-full rounded-md border p-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Table ID</label>
            <input
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              placeholder="从表格 URL table= 参数获取"
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
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c.enabled ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}
          >
            {c.enabled ? '已启用' : '未启用'}
          </span>
        </div>
        {typeof c.lastSyncAt === 'string' && (
          <div className="text-sm text-muted-foreground">
            最近同步: {formatDateTime(c.lastSyncAt)}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => testMutation.mutate()}
          loading={testMutation.isPending}
        >
          {testMutation.isPending ? '测试中...' : '测试连接'}
        </Button>
        <Button
          onClick={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
        >
          {saveMutation.isPending ? '保存中...' : '保存配置'}
        </Button>
      </div>
    </div>
  );
}
