'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getComplianceRules, updateComplianceRules } from '@/lib/api/settings';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { Button } from '@/components/ui/button';
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
      />
      {rules && (
        <div className="max-w-2xl space-y-6">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="font-semibold">敏感词</h3>
            <div className="flex flex-wrap gap-2">
              {localWords.map((word) => (
                <span
                  key={word}
                  className="rounded-full bg-destructive/10 border border-destructive/25 px-3 py-1 text-sm text-destructive flex items-center gap-1"
                >
                  {word}
                  <Button
                    variant="ghost-destructive"
                    size="xs"
                    aria-label={`删除 ${word}`}
                    onClick={() =>
                      setLocalWords((w) => w.filter((x) => x !== word))
                    }
                    className="ml-1 h-auto px-1"
                  >
                    &times;
                  </Button>
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
              <Button
                variant="outline"
                onClick={() => {
                  if (newWord.trim()) {
                    setLocalWords((w) => [...w, newWord.trim()]);
                    setNewWord('');
                  }
                }}
              >
                添加
              </Button>
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
                <Button
                  variant="ghost-destructive"
                  size="xs"
                  onClick={() =>
                    setLocalPhrases((p) => p.filter((x) => x !== phrase))
                  }
                >
                  删除
                </Button>
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
          <Button
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
          >
            {saveMutation.isPending ? '保存中...' : '保存规则'}
          </Button>
        </div>
      )}
    </div>
  );
}
