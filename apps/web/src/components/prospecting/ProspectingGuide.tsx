'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useAuth } from '@/providers/AuthProvider';
import { CheckCircle2, Circle, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLlmConfig } from '@/lib/api/settings';
import { getAnalyticsOverview } from '@/lib/api/analytics';
import { queryKeys } from '@/lib/query-keys';

/**
 * First-run guide for the prospecting landing page. New users land here by
 * default and historically had no idea what to do first; this walks them
 * through the three prerequisites (LLM key → platform account → first task)
 * with live completion checks, and only renders while there are no tasks.
 */
export function ProspectingGuide({
  onStartCreate
}: {
  onStartCreate: () => void;
}) {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [dismissLoaded, setDismissLoaded] = useState(false);

  const { data: llmConfig } = useQuery({
    queryKey: queryKeys.settings.llm,
    queryFn: getLlmConfig
  });
  const { data: overview } = useQuery({
    queryKey: queryKeys.analytics.overview,
    queryFn: getAnalyticsOverview,
    staleTime: 60_000
  });

  const storageKey = user?.id ? `prospecting-guide-dismissed:${user.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      setDismissed(localStorage.getItem(storageKey) === 'true');
    } catch {
      /* showing the guide must not depend on storage availability */
    }
    setDismissLoaded(true);
  }, [storageKey]);

  const dismiss = () => {
    setDismissed(true);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, 'true');
    } catch {
      /* ignore */
    }
  };

  if (dismissed || !dismissLoaded) return null;

  const llmReady = llmConfig?.effectiveConfigured === true;
  const accountReady = (overview?.platformAccounts ?? 0) > 0;

  const steps = [
    {
      id: 'llm',
      title: '配置 AI 模型（API Key）',
      description:
        '系统用 AI 理解你的获客需求并生成采集策略，只需粘贴一个 API Key（支持智谱 / DeepSeek / Kimi / OpenAI 等）。',
      done: llmReady,
      cta: llmReady ? null : (
        <Link
          href="/integrations/llm"
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          去配置 <ChevronRight className="h-3 w-3" />
        </Link>
      )
    },
    {
      id: 'account',
      title: '连接平台账号',
      description:
        '在「集成配置」扫码登录你的自媒体账号（如抖音），获客任务将以该账号身份执行。',
      done: accountReady,
      cta: accountReady ? null : (
        <Link
          href="/integrations/platforms"
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          去连接 <ChevronRight className="h-3 w-3" />
        </Link>
      )
    },
    {
      id: 'task',
      title: '创建第一个获客任务',
      description:
        '点击「新建任务」，用一句话描述你想找的客户（可参考示例），AI 分析后确认策略即可开始。',
      done: false,
      cta: (
        <button
          onClick={onStartCreate}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          开始创建 <ChevronRight className="h-3 w-3" />
        </button>
      )
    }
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">三步开始智能获客</h3>
            <p className="text-xs text-muted-foreground">
              按顺序完成下面的准备步骤，即可让 AI 帮你挖掘高意向潜客
            </p>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          不再显示
        </button>
      </div>

      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3',
              step.done
                ? 'border-success/25 bg-success/10'
                : 'border-border'
            )}
          >
            {step.done ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            ) : (
              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {index + 1}. {step.title}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {step.description}
              </p>
            </div>
            {step.done ? (
              <span className="shrink-0 text-xs text-success">
                已完成
              </span>
            ) : (
              step.cta
            )}
          </li>
        ))}
      </ol>

      <p className="mt-3 text-xs text-muted-foreground">
        已完成 {doneCount}/{steps.length} 步
      </p>
    </div>
  );
}
