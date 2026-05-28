'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAiConfig, updateAiConfig } from '@/lib/api/settings';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { useState, useEffect } from 'react';

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

  useEffect(() => {
    if (config) {
      setProvider(config.provider);
      setBaseUrl(config.baseUrl ?? '');
      setModel(config.model);
      setTemperature(config.temperature);
      setMaxTokens(config.maxTokens);
      setDailyTokenLimit(config.dailyTokenLimit);
      setFeatures(config.features);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: () => updateAiConfig({ provider, baseUrl, apiKey, model, temperature, maxTokens, dailyTokenLimit, features }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-config'] })
  });

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="AI 配置" description="配置 LLM Provider 和 AI 功能开关" />
      {config && (
        <div className="max-w-2xl space-y-6">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="font-semibold">LLM Provider</h3>
            <div className="space-y-3">
              <div><label className="text-sm font-medium">Provider</label><select value={provider} onChange={(e) => setProvider(e.target.value)} className="mt-1 w-full rounded-md border p-2 text-sm"><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="azure">Azure OpenAI</option></select></div>
              <div><label className="text-sm font-medium">Base URL</label><input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" className="mt-1 w-full rounded-md border p-2 text-sm" /></div>
              <div><label className="text-sm font-medium">API Key</label><input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-***" className="mt-1 w-full rounded-md border p-2 text-sm" /></div>
              <div><label className="text-sm font-medium">模型名称</label><input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 w-full rounded-md border p-2 text-sm" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">温度</label><input type="number" step="0.1" min="0" max="2" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="mt-1 w-full rounded-md border p-2 text-sm" /></div>
                <div><label className="text-sm font-medium">最大 Tokens</label><input type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} className="mt-1 w-full rounded-md border p-2 text-sm" /></div>
              </div>
              <div><label className="text-sm font-medium">每日 Token 限额</label><input type="number" value={dailyTokenLimit} onChange={(e) => setDailyTokenLimit(Number(e.target.value))} className="mt-1 w-full rounded-md border p-2 text-sm" /></div>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="font-semibold">功能开关</h3>
            <div className="space-y-3">
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
            </div>
          </div>
          <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground disabled:opacity-50">
            {saveMutation.isPending ? '保存中...' : '保存配置'}
          </button>
        </div>
      )}
    </div>
  );
}
