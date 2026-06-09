'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getComplianceRules, updateComplianceRules } from '@/lib/api/settings';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { useState, useEffect } from 'react';

export default function CompliancePage() {
  const qc = useQueryClient();
  const { data: rules, isLoading } = useQuery({
    queryKey: ['compliance-rules'],
    queryFn: getComplianceRules
  });
  const [newWord, setNewWord] = useState('');
  const [localWords, setLocalWords] = useState<string[]>([]);
  const [localPhrases, setLocalPhrases] = useState<string[]>([]);

  useEffect(() => {
    if (rules) {
      setLocalWords([...rules.sensitiveWords]);
      setLocalPhrases([...rules.forbiddenPhrases]);
    }
  }, [rules]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateComplianceRules({
        sensitiveWords: localWords,
        forbiddenPhrases: localPhrases
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance-rules'] })
  });

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="合规规则"
        description="配置敏感词、禁用话术和人工确认规则"
      />
      {rules && (
        <div className="max-w-2xl space-y-6">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="font-semibold">敏感词</h3>
            <div className="flex flex-wrap gap-2">
              {localWords.map((word) => (
                <span
                  key={word}
                  className="rounded-full bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-3 py-1 text-sm text-red-700 flex items-center gap-1"
                >
                  {word}
                  <button
                    onClick={() =>
                      setLocalWords((w) => w.filter((x) => x !== word))
                    }
                    className="ml-1 text-red-400 hover:text-red-600"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                className="flex-1 rounded-md border p-2 text-sm"
                placeholder="添加敏感词..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newWord.trim()) {
                    setLocalWords((w) => [...w, newWord.trim()]);
                    setNewWord('');
                  }
                }}
              />
              <button
                onClick={() => {
                  if (newWord.trim()) {
                    setLocalWords((w) => [...w, newWord.trim()]);
                    setNewWord('');
                  }
                }}
                className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
              >
                添加
              </button>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="font-semibold">禁用话术</h3>
            {localPhrases.map((phrase) => (
              <div
                key={phrase}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <span className="text-sm">{phrase}</span>
                <button
                  onClick={() =>
                    setLocalPhrases((p) => p.filter((x) => x !== phrase))
                  }
                  className="text-xs text-destructive hover:underline"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="font-semibold">自动回复限制</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">每日最大回复数</span>
                <span className="text-sm font-medium">
                  {rules.autoReplyLimits.maxDailyReplies}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">置信度阈值</span>
                <span className="text-sm font-medium">
                  {rules.autoReplyLimits.confidenceThreshold}
                </span>
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="font-semibold">人工确认规则</h3>
            <div className="space-y-3">
              {rules.humanConfirmRules.map((rule, i) => (
                <label key={i} className="flex items-center justify-between">
                  <span className="text-sm">{rule.action}</span>
                  <span className="text-xs text-muted-foreground">
                    阈值 {rule.threshold}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saveMutation.isPending ? '保存中...' : '保存规则'}
          </button>
        </div>
      )}
    </div>
  );
}
