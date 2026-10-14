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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectOption } from '@/components/ui/select';
import { KeyRound, CheckCircle2, ExternalLink, Check } from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';

/**
 * Operator-facing LLM provider config. Stored org-level in AppConfig
 * (key='llm_config') with the apiKey encrypted at rest; the worker reads it at
 * run time via resolveLlmClientFromDb, so LLM setup no longer requires .env.
 * The apiKey field is intentionally left blank after a successful save (it is
 * never echoed back — GET only reports hasApiKey).
 */

interface LlmPreset {
  id: string;
  label: string;
  hint: string;
  provider: 'openai' | 'anthropic';
  baseUrl: string;
  model: string;
  keyUrl?: string;
}

const PRESETS: LlmPreset[] = [
  {
    id: 'zhipu',
    label: '智谱 GLM',
    hint: '国内直连 · 有免费模型',
    provider: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    hint: '国内直连 · 性价比高',
    provider: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys'
  },
  {
    id: 'kimi',
    label: 'Kimi',
    hint: '月之暗面',
    provider: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    hint: '官方接口',
    provider: 'openai',
    baseUrl: '',
    model: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'anthropic',
    label: 'Claude',
    hint: 'Anthropic 官方',
    provider: 'anthropic',
    baseUrl: '',
    model: 'claude-sonnet-4-6',
    keyUrl: 'https://console.anthropic.com/settings/keys'
  },
  {
    id: 'custom',
    label: '自定义 / 中转',
    hint: '自填接口地址与模型',
    provider: 'openai',
    baseUrl: '',
    model: ''
  }
];

function normalizeBaseUrl(url: string | null | undefined): string {
  return (url ?? '').trim().replace(/\/+$/, '');
}

function detectPresetId(
  provider: string,
  baseUrl: string | null | undefined
): string {
  const normalized = normalizeBaseUrl(baseUrl);
  const match = PRESETS.find(
    (preset) =>
      preset.id !== 'custom' &&
      preset.provider === provider &&
      normalizeBaseUrl(preset.baseUrl) === normalized
  );
  return match?.id ?? 'custom';
}

export function LlmConfigCard() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: queryKeys.settings.llm,
    queryFn: getLlmConfig
  });

  const [presetId, setPresetId] = useState('openai');
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
      setPresetId(detectPresetId(q.data.provider, q.data.baseUrl));
      setHydrated(true);
    }
  }, [q.data, hydrated]);

  const applyPreset = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(id);
    if (id === 'custom') return; // keep whatever the user already typed
    setProvider(preset.provider);
    setBaseUrl(preset.baseUrl);
    setModel(preset.model);
  };

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
  const selectedPreset = PRESETS.find((p) => p.id === presetId);
  const needsApiKey = !view?.hasApiKey && !apiKey.trim();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> LLM 配置
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          选择一个服务商并粘贴 API Key 即可，接口地址和模型会自动填好。Key
          加密存储，不会写入 .env。
        </p>

        <div>
          <p className="mb-2 text-sm font-medium">第 1 步 · 选择服务商</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PRESETS.map((preset) => {
              const selected = preset.id === presetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={cn(
                    'relative rounded-lg border p-3 text-left transition-colors',
                    selected
                      ? 'border-primary bg-primary/5'
                      : 'hover:border-primary/40 hover:bg-muted/40'
                  )}
                >
                  {selected && (
                    <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" />
                  )}
                  <p className="text-sm font-medium">{preset.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {preset.hint}
                  </p>
                </button>
              );
            })}
          </div>
          {selectedPreset?.keyUrl && (
            <a
              href={selectedPreset.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              前往 {selectedPreset.label} 官网获取 API Key{' '}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {presetId === 'custom' && (
            <p className="mt-2 text-xs text-muted-foreground">
              使用自建中转或列表外的服务商时，在下方「高级选项」填写接口地址和模型。
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">第 2 步 · 填入 API Key</p>
          <input
            type="password"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              view?.hasApiKey
                ? '••••••••（已配置，留空则保留原 Key）'
                : '粘贴你的 API Key（sk-…）'
            }
          />
        </div>

        <details className="rounded-lg border bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer select-none text-xs text-muted-foreground">
            高级选项：接口地址与模型（选择服务商后已自动填好，一般无需修改）
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">接口协议</span>
              <Select
                value={provider}
                onValueChange={(v) => setProvider(v as 'openai' | 'anthropic')}
              >
                <SelectOption value="openai">OpenAI 兼容</SelectOption>
                <SelectOption value="anthropic">Anthropic</SelectOption>
              </Select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">模型</span>
              <input
                className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o / claude-sonnet-4-6 …"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="text-muted-foreground">
                Base URL（官方接口留空；中转服务填中转地址）
              </span>
              <input
                className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </label>
          </div>
        </details>

        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            {view?.hasApiKey ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                已配置 API Key
                {view.updatedAt
                  ? `（${formatDateTime(view.updatedAt)}）`
                  : ''}
              </>
            ) : needsApiKey ? (
              '尚未配置 API Key'
            ) : (
              '填写完成后点击保存'
            )}
          </span>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !hydrated || needsApiKey}
            title={needsApiKey ? '请先填写 API Key' : undefined}
          >
            {mut.isPending ? '保存中…' : '保存配置'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
