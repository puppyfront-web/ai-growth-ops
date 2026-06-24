'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getLlmConfig,
  saveLlmConfig,
  type LlmConfigView
} from '@/lib/api/settings';
import { queryKeys } from '@/lib/query-keys';
import { toast } from '@/components/ui/toast';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectOption } from '@/components/ui/select';
import { KeyRound, CheckCircle2 } from 'lucide-react';

/**
 * Operator-facing LLM provider config. Stored org-level in AppConfig
 * (key='llm_config') with the apiKey encrypted at rest; the worker reads it at
 * run time via resolveLlmClientFromDb, so LLM setup no longer requires .env.
 * The apiKey field is intentionally left blank after a successful save (it is
 * never echoed back — GET only reports hasApiKey).
 */
export function LlmConfigCard() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: queryKeys.settings.llm,
    queryFn: getLlmConfig
  });

  const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (q.data && !hydrated) {
      setProvider(q.data.provider);
      setBaseUrl(q.data.baseUrl);
      setModel(q.data.model);
      setHydrated(true);
    }
  }, [q.data, hydrated]);

  const mut = useMutation({
    mutationFn: () =>
      saveLlmConfig({
        provider,
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim(),
        model: model.trim()
      }),
    onSuccess: () => {
      setApiKey('');
      toast.success('LLM 配置已保存');
      qc.invalidateQueries({ queryKey: queryKeys.settings.llm });
    },
    onError: () => toast.error('保存失败，请重试')
  });

  const view: LlmConfigView | undefined = q.data;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> LLM 配置
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          在此配置模型 provider，worker 运行时直接读取（API Key 加密存储，不写 .env）。配好后即可发起真实运行。
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Provider</span>
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as 'openai' | 'anthropic')}
            >
              <SelectOption value="openai">OpenAI（兼容）</SelectOption>
              <SelectOption value="anthropic">Anthropic</SelectOption>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Model</span>
            <input
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o / claude-sonnet-4-6 …"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="text-muted-foreground">
              Base URL（留空走官方；国内中转填这里）
            </span>
            <input
              className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="text-muted-foreground">
              API Key
              {view?.hasApiKey ? '（已配置，留空则保留原 Key）' : ''}
            </span>
            <input
              type="password"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={view?.hasApiKey ? '••••••••（已配置）' : 'sk-…'}
            />
          </label>
        </div>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            {view?.hasApiKey ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                已配置 API Key
                {view.updatedAt
                  ? `（${new Date(view.updatedAt).toLocaleString('zh-CN', {
                      hour12: false
                    })}）`
                  : ''}
              </>
            ) : (
              '尚未配置 API Key'
            )}
          </span>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !hydrated}>
            {mut.isPending ? '保存中…' : '保存配置'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
