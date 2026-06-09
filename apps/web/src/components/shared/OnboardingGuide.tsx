'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAnalyticsOverview } from '@/lib/api/analytics';
import { listPublishJobs } from '@/lib/api/publish';
import Link from 'next/link';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  targetPath: string;
  checkCompleted: (data: {
    hasPlatformAccounts: boolean;
    hasContent: boolean;
    hasPublished: boolean;
  }) => boolean;
}

const STEPS: OnboardingStep[] = [
  {
    id: 'connect-platform',
    title: '连接平台账号',
    description: '连接你的第一个社交媒体账号，开始自动化运营',
    targetPath: '/integrations/platforms',
    checkCompleted: (d) => d.hasPlatformAccounts
  },
  {
    id: 'create-content',
    title: '创建第一条内容',
    description: '使用 AI 生成或手动创建你的第一条运营内容',
    targetPath: '/content/new',
    checkCompleted: (d) => d.hasContent
  },
  {
    id: 'publish',
    title: '发布内容',
    description: '将内容发布到已连接的平台',
    targetPath: '/publish/queue',
    checkCompleted: (d) => d.hasPublished
  }
];

export function OnboardingGuide() {
  const [dismissed, setDismissed] = useState(false);
  const [manuallyCompleted] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const saved = localStorage.getItem('onboarding-completed');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const { data: overview } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: getAnalyticsOverview,
    staleTime: 60_000
  });

  const { data: publishData } = useQuery({
    queryKey: ['publish-jobs'],
    queryFn: () => listPublishJobs({ page: 1, pageSize: 1 }),
    staleTime: 60_000
  });

  const checks = {
    hasPlatformAccounts: (overview?.platformAccounts ?? 0) > 0,
    hasContent: (overview?.totalContentItems ?? 0) > 0,
    hasPublished:
      (overview?.totalPublished ?? 0) > 0 || (publishData?.total ?? 0) > 0
  };

  const steps = STEPS.map((step) => ({
    ...step,
    completed: manuallyCompleted.has(step.id) || step.checkCompleted(checks)
  }));

  const completedCount = steps.filter((s) => s.completed).length;
  const allDone = completedCount === steps.length;

  // Persist completed steps
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const completed = steps.filter((s) => s.completed).map((s) => s.id);
    localStorage.setItem('onboarding-completed', JSON.stringify(completed));
  }, [steps]);

  // Auto-dismiss after all done
  useEffect(() => {
    if (allDone && !dismissed) {
      const timer = setTimeout(() => setDismissed(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [allDone, dismissed]);

  // Check localStorage for permanent dismissal
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const permDismissed = localStorage.getItem('onboarding-dismissed');
    if (permDismissed === 'true') setDismissed(true);
  }, []);

  if (dismissed || allDone) return null;

  const nextStep = steps.find((s) => !s.completed);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <span className="text-sm font-bold text-primary">
              {completedCount}/{steps.length}
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold">快速开始</h3>
            <p className="text-xs text-muted-foreground">
              完成以下步骤开始使用 AI Growth Ops
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setDismissed(true);
            localStorage.setItem('onboarding-dismissed', 'true');
          }}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-3 transition-colors',
              step.completed
                ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30'
                : nextStep?.id === step.id
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border opacity-60'
            )}
          >
            {step.completed ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-sm',
                  step.completed && 'line-through text-muted-foreground'
                )}
              >
                {step.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {step.description}
              </p>
            </div>
            {!step.completed && nextStep?.id === step.id && (
              <Link
                href={step.targetPath}
                className="flex shrink-0 items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                开始 <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {completedCount}/{steps.length}
        </span>
      </div>
    </div>
  );
}
