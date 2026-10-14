'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getIcpConfig, updateIcpConfig } from '@/lib/api/settings';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { Button } from '@/components/ui/button';

function TagEditor({
  label,
  items,
  onChange,
  placeholder
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-sm">{label}</h3>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full border px-3 py-1 text-sm flex items-center gap-1"
          >
            {item}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-label={`删除 ${item}`}
              onClick={() => onChange(items.filter((x) => x !== item))}
              className="h-auto px-1 text-muted-foreground hover:text-foreground"
            >
              ×
            </Button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-md border p-2 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              onChange([...items, draft.trim()]);
              setDraft('');
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (!draft.trim()) return;
            onChange([...items, draft.trim()]);
            setDraft('');
          }}
        >
          添加
        </Button>
      </div>
    </div>
  );
}

export default function IcpSettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['icp-config'],
    queryFn: getIcpConfig
  });
  const [local, setLocal] = useState({
    targetIndustries: [] as string[],
    targetRoles: [] as string[],
    highIntentKeywords: [] as string[],
    excludedKeywords: [] as string[]
  });

  useEffect(() => {
    if (data) setLocal(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => updateIcpConfig(local),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['icp-config'] })
  });

  if (isLoading) return <LoadingState />;
  if (error || !data) {
    return (
      <div className="p-6 text-sm text-destructive">
        ICP 配置加载失败，当前配置不会被覆盖。
        <Button
          variant="ghost"
          size="xs"
          onClick={() => refetch()}
          className="ml-2 h-auto px-1 underline"
        >
          重试
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="ICP 理想客户"
      />
      <div className="max-w-2xl space-y-6 rounded-xl border bg-card p-5">
        <TagEditor
          label="目标行业关键词"
          items={local.targetIndustries}
          onChange={(targetIndustries) =>
            setLocal((s) => ({ ...s, targetIndustries }))
          }
          placeholder="如：科技、制造、电商"
        />
        <TagEditor
          label="目标职位关键词"
          items={local.targetRoles}
          onChange={(targetRoles) => setLocal((s) => ({ ...s, targetRoles }))}
          placeholder="如：采购经理、总监"
        />
        <TagEditor
          label="高意向关键词"
          items={local.highIntentKeywords}
          onChange={(highIntentKeywords) =>
            setLocal((s) => ({ ...s, highIntentKeywords }))
          }
          placeholder="如：报价、演示、合作"
        />
        <TagEditor
          label="排除关键词"
          items={local.excludedKeywords}
          onChange={(excludedKeywords) =>
            setLocal((s) => ({ ...s, excludedKeywords }))
          }
          placeholder="如：竞品名、无关行业"
        />
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!data}
          loading={saveMutation.isPending}
        >
          {saveMutation.isPending ? '保存中…' : '保存配置'}
        </Button>
        {saveMutation.isError && (
          <p className="text-sm text-destructive">
            {(saveMutation.error as Error).message}
          </p>
        )}
      </div>
    </div>
  );
}
