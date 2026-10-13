'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWecomConfig, updateWecomConfig } from '@/lib/api/integrations';
import { LoadingState } from '@/components/shared/LoadingState';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';

export function WecomSyncForm() {
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
    <div className="max-w-2xl space-y-6">
      <div className="rounded-xl border bg-muted/40 p-5 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <BookOpen className="h-4 w-4" />
          配置指引
        </div>
        <ol className="mt-3 list-decimal space-y-2 pl-4 text-muted-foreground">
          <li>
            登录企业微信管理后台，在「我的企业 →
            企业信息」页面底部复制企业 ID（CorpID）填入下方。
            <a
              href="https://work.weixin.qq.com/"
              target="_blank"
              rel="noreferrer"
              className="ml-1 inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
            >
              企业微信管理后台
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            在「应用管理」中创建一个自建应用，将应用的 Agent ID
            填入下方，并把需要同步的销售成员加入应用可见范围。
          </li>
          <li>
            保存配置后，系统即可通过该应用对接企业微信客户联系接口。更多说明见
            <a
              href="https://developer.work.weixin.qq.com/document/"
              target="_blank"
              rel="noreferrer"
              className="mx-0.5 inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
            >
              企业微信开发文档
              <ExternalLink className="h-3 w-3" />
            </a>
            。
          </li>
        </ol>
      </div>
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="font-semibold">应用配置</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">企业 ID（CorpID）</label>
            <input
              value={corpId}
              onChange={(e) => setCorpId(e.target.value)}
              placeholder="wwxxxxxxxxxxxxxxxx"
              className="mt-1 w-full rounded-md border p-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">应用 Agent ID</label>
            <input
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="1000002"
              className="mt-1 w-full rounded-md border p-2 text-sm"
            />
          </div>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">启用状态</span>
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
          onClick={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
        >
          {saveMutation.isPending ? '保存中...' : '保存配置'}
        </Button>
      </div>
    </div>
  );
}
