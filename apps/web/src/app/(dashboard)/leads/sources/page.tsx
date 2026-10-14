'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listLeadSources,
  createLeadSource,
  deleteLeadSource,
  type LeadSourceConfig
} from '@/lib/api/leads';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { formatDateTime } from '@/lib/utils';
import { LoadingState } from '@/components/shared/LoadingState';
import { LeadLevelBadge } from '@/components/shared/StatusBadge';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';

export default function LeadSourcesPage() {
  const qc = useQueryClient();
  const { data: sources, isLoading } = useQuery({
    queryKey: ['lead-sources'],
    queryFn: listLeadSources
  });

  const [name, setName] = useState('');
  const [defaultLevel, setDefaultLevel] = useState('B');
  const [copied, setCopied] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => createLeadSource({ name, defaultLevel }),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['lead-sources'] });
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLeadSource(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-sources'] })
  });

  const webhookUrl = () =>
    `${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3100'}/api/leads/webhook/ingest`;

  const copyToken = (s: LeadSourceConfig) => {
    const text = webhookUrl();
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(s.id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="线索来源"
        description="配置外部 Webhook 接入 · 第三方系统可通过 Webhook 推送线索"
      />

      {/* Create form */}
      <div className="mb-6 rounded-xl border bg-card p-4">
        <h3 className="font-semibold mb-3">新建来源</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-muted-foreground">来源名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：官网表单 / 展会线索"
              className="mt-1 w-56 rounded border bg-background px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">默认等级</label>
            <NativeSelect
              value={defaultLevel}
              onChange={(e) => setDefaultLevel(e.target.value)}
              className="mt-1 rounded border bg-background px-2 py-1 text-sm"
            >
              {(['A', 'B', 'C', 'D'] as const).map((lv) => (
                <option key={lv} value={lv}>{lv}级</option>
              ))}
            </NativeSelect>
          </div>
          <Button
            size="sm"
            onClick={() => name.trim() && createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            loading={createMutation.isPending}
          >
            {createMutation.isPending ? '创建中…' : '创建来源'}
          </Button>
        </div>
      </div>

      {isLoading && <LoadingState />}

      {/* Sources list */}
      <div className="space-y-3">
        {sources?.map((s) => (
          <div key={s.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  <LeadLevelBadge level={s.defaultLevel as 'A' | 'B' | 'C' | 'D'} />
                  <span className="text-xs text-muted-foreground">
                    默认平台: {s.defaultPlatform}
                  </span>
                  {!s.enabled && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      已停用
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  创建于 {formatDateTime(s.createdAt)}
                </div>
              </div>
              <Button
                variant="ghost-destructive"
                size="xs"
                onClick={() => deleteMutation.mutate(s.id)}
              >
                删除
              </Button>
            </div>

            <div className="mt-3 rounded-lg bg-muted/40 p-2">
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs break-all">
                  POST {webhookUrl()}
                </code>
                <Button
                  size="xs"
                  className="shrink-0 bg-primary/10 text-primary hover:bg-primary/20"
                  onClick={() => copyToken(s)}
                >
                  {copied === s.id ? '已复制!' : '复制'}
                </Button>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Header: <code>X-Webhook-Token: {s.token}</code>
              </div>
            </div>
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer">
                查看请求示例
              </summary>
              <pre className="mt-1 rounded bg-muted/60 p-2 text-xs overflow-x-auto">{`curl -X POST ${webhookUrl()} \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Token: ${s.token}" \\
  -d '{"externalUserName":"张总","intent":"咨询报价","level":"A"}'`}</pre>
            </details>
          </div>
        ))}
        {sources?.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            暂无线索来源。创建后即可通过 Webhook 接收外部线索。
          </p>
        )}
      </div>
    </div>
  );
}
