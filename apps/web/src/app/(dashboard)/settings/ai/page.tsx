'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAiConfig, updateAiConfig } from '@/lib/api/settings';
import type { MediaGenerationConfig } from '@/lib/api/settings';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useState, useEffect } from 'react';
import { Bot, Image, Sparkles } from 'lucide-react';

export default function AiSettingsPage() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery({ queryKey: ['ai-config'], queryFn: getAiConfig });
  const [provider, setProvider] = useState('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [dailyTokenLimit, setDailyTokenLimit] = useState(100000);
  const [features, setFeatures] = useState({ textGeneration: true, leadIdentification: true, replySuggestion: true });
  const [mediaGen, setMediaGen] = useState<MediaGenerationConfig>({
    mode: 'llm_provider',
    provider: 'openai',
    apiKey: '',
    baseUrl: '',
    model: 'dall-e-3',
  });

  useEffect(() => {
    if (config) {
      setProvider(config.provider);
      setBaseUrl(config.baseUrl ?? '');
      setModel(config.model);
      setTemperature(config.temperature);
      setMaxTokens(config.maxTokens);
      setDailyTokenLimit(config.dailyTokenLimit);
      setFeatures(config.features);
      if (config.mediaGeneration) setMediaGen(config.mediaGeneration);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: () => updateAiConfig({ provider, baseUrl, apiKey, model, temperature, maxTokens, dailyTokenLimit, features, mediaGeneration: mediaGen }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-config'] })
  });

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="AI 配置" description="配置 LLM Provider 和 AI 功能开关" />
      {config && (
        <div className="max-w-2xl space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-blue-500" />
                <CardTitle className="text-base font-semibold">LLM Provider</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div><label className="text-sm font-medium">Provider</label><select value={provider} onChange={(e) => setProvider(e.target.value)} className="mt-1 w-full rounded-md border p-2 text-sm"><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="azure">Azure OpenAI</option></select></div>
              <div><label className="text-sm font-medium">Base URL</label><input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" className="mt-1 w-full rounded-md border p-2 text-sm" /></div>
              <div><label className="text-sm font-medium">API Key</label><input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-***" className="mt-1 w-full rounded-md border p-2 text-sm" /></div>
              <div><label className="text-sm font-medium">模型名称</label><input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 w-full rounded-md border p-2 text-sm" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">温度</label><input type="number" step="0.1" min="0" max="2" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="mt-1 w-full rounded-md border p-2 text-sm" /></div>
                <div><label className="text-sm font-medium">最大 Tokens</label><input type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} className="mt-1 w-full rounded-md border p-2 text-sm" /></div>
              </div>
              <div><label className="text-sm font-medium">每日 Token 限额</label><input type="number" value={dailyTokenLimit} onChange={(e) => setDailyTokenLimit(Number(e.target.value))} className="mt-1 w-full rounded-md border p-2 text-sm" /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <CardTitle className="text-base font-semibold">功能开关</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: 'textGeneration' as const, label: '文本生成' },
                { key: 'leadIdentification' as const, label: '线索识别' },
                { key: 'replySuggestion' as const, label: '回复建议' },
              ].map((item) => (
                <label key={item.key} className="flex items-center justify-between">
                  <span className="text-sm">{item.label}</span>
                  <input type="checkbox" checked={features[item.key]} onChange={(e) => setFeatures((f) => ({ ...f, [item.key]: e.target.checked }))} className="rounded" />
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Image className="h-4 w-4 text-emerald-500" />
                <CardTitle className="text-base font-semibold">素材生成配置</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">配置 AI 图片/视频生成的 Provider</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">配置模式</label>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    onClick={() => setMediaGen((m) => ({ ...m, mode: 'llm_provider' }))}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mediaGen.mode === 'llm_provider' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                  >
                    复用 LLM 配置
                  </button>
                  <button
                    onClick={() => setMediaGen((m) => ({ ...m, mode: 'dedicated' }))}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mediaGen.mode === 'dedicated' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                  >
                    独立配置
                  </button>
                </div>
              </div>

              {mediaGen.mode === 'llm_provider' && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-sm text-muted-foreground">
                    将使用上方 LLM 配置的 Provider 和 API Key 调用图片生成接口。
                    支持 OpenAI 的 <code className="rounded bg-muted px-1">gpt-4o</code> (图片生成) 和 <code className="rounded bg-muted px-1">dall-e-3</code>。
                  </p>
                </div>
              )}

              {mediaGen.mode === 'llm_provider' && (
                <div>
                  <label className="text-sm font-medium">图片生成模型</label>
                  <input value={mediaGen.model} onChange={(e) => setMediaGen((m) => ({ ...m, model: e.target.value }))} placeholder="dall-e-3" className="mt-1 w-full rounded-md border p-2 text-sm" />
                  <p className="mt-1 text-xs text-muted-foreground">留空则使用 dall-e-3</p>
                </div>
              )}

              {mediaGen.mode === 'dedicated' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Provider</label>
                    <select value={mediaGen.provider} onChange={(e) => setMediaGen((m) => ({ ...m, provider: e.target.value }))} className="mt-1 w-full rounded-md border p-2 text-sm">
                      <option value="openai">OpenAI (DALL·E)</option>
                      <option value="stability">Stability AI</option>
                      <option value="other">其他 OpenAI 兼容</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">API Key</label>
                    <input type="password" value={mediaGen.apiKey} onChange={(e) => setMediaGen((m) => ({ ...m, apiKey: e.target.value }))} placeholder="sk-***" className="mt-1 w-full rounded-md border p-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Base URL</label>
                    <input value={mediaGen.baseUrl} onChange={(e) => setMediaGen((m) => ({ ...m, baseUrl: e.target.value }))} placeholder="https://api.openai.com/v1" className="mt-1 w-full rounded-md border p-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">模型名称</label>
                    <input value={mediaGen.model} onChange={(e) => setMediaGen((m) => ({ ...m, model: e.target.value }))} placeholder="dall-e-3" className="mt-1 w-full rounded-md border p-2 text-sm" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground disabled:opacity-50">
            {saveMutation.isPending ? '保存中...' : '保存配置'}
          </button>
        </div>
      )}
    </div>
  );
}
