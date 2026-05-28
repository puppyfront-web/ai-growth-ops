'use client';

import { useQuery } from '@tanstack/react-query';
import { getDashboard } from '@/lib/api/dashboard';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PlatformBadge } from '@/components/shared/StatusBadge';
import { LeadLevelBadge } from '@/components/shared/StatusBadge';
import { publishStatusLabels, contentTypeLabels } from '@/lib/constants';
import { formatNumber } from '@/lib/utils';
import Link from 'next/link';
import { Lightbulb, Users, FileText, Send, Eye } from 'lucide-react';
import type { DashboardMetrics } from '@/types/dashboard';

function MetricCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{formatNumber(value)}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard });

  if (isLoading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message="加载工作台数据失败" onRetry={() => refetch()} />;
  if (!data) return null;

  const m: DashboardMetrics = data.metrics;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="运营工作台" description="运营数据总览" />

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5 mb-6">
        <MetricCard icon={Send} label="发布任务" value={m.publishJobs} />
        <MetricCard icon={Send} label="已发布" value={m.publishedJobs} />
        <MetricCard icon={Eye} label="互动数" value={m.interactions} />
        <MetricCard icon={Users} label="合格线索" value={m.qualifiedLeads} />
        <MetricCard icon={Lightbulb} label="调研洞察" value={m.researchInsights} />
        <MetricCard icon={FileText} label="内容项" value={m.contentItems} />
        <MetricCard icon={FileText} label="内容变体" value={m.contentVariants} />
        <MetricCard icon={Send} label="平台账号" value={m.platformAccounts} />
        <MetricCard icon={Lightbulb} label="选题机会" value={m.contentOpportunities} />
        <MetricCard icon={Send} label="Provider 执行" value={m.providerRuns} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Publish Jobs */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-lg font-semibold mb-4">最近发布任务</h3>
          <div className="space-y-2">
            {data.recentPublishJobs.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">暂无发布任务</p>
            )}
            {data.recentPublishJobs.map((job) => (
              <Link key={job.id} href={`/publish/${job.id}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50">
                <div className="flex items-center gap-2">
                  <PlatformBadge platform={job.platform} />
                  <span className="text-xs text-muted-foreground">{contentTypeLabels[job.contentType] ?? job.contentType}</span>
                </div>
                <StatusBadge status={job.status} label={publishStatusLabels[job.status as keyof typeof publishStatusLabels]} />
              </Link>
            ))}
          </div>
        </div>

        {/* Lead Summaries */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-lg font-semibold mb-4">线索概览</h3>
          <div className="space-y-2">
            {data.leadSummaries.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">暂无线索</p>
            )}
            {data.leadSummaries.map((lead) => (
              <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{lead.name}</span>
                  <LeadLevelBadge level={lead.level} />
                </div>
                <StatusBadge status={lead.status} />
              </Link>
            ))}
          </div>
        </div>

        {/* Insights */}
        <div className="rounded-xl border bg-card p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="h-5 w-5 text-blue-500" />
            <h3 className="text-lg font-semibold">调研洞察</h3>
          </div>
          <div className="space-y-2">
            {data.insights.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">暂无洞察</p>
            )}
            {data.insights.map((insight) => (
              <Link key={insight.id} href="/research/insights" className="block rounded-lg border p-3 hover:bg-accent/50">
                <div className="font-medium text-sm">{insight.title}</div>
                {insight.summary && <div className="text-xs text-muted-foreground mt-1">{insight.summary}</div>}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
