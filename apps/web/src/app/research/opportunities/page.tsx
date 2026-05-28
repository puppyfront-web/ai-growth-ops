'use client';

import { useQuery } from '@tanstack/react-query';
import { listOpportunities } from '@/lib/api/research';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PlatformBadge } from '@/components/shared/StatusBadge';
import { LoadingState } from '@/components/shared/LoadingState';
import Link from 'next/link';

import type { Platform } from '@/types/enums';

const priorityStyles: Record<string, string> = { high: 'bg-red-50 text-red-700 border-red-200', medium: 'bg-yellow-50 text-yellow-700 border-yellow-200', low: 'bg-gray-50 text-gray-600 border-gray-200' };
const priorityLabels: Record<string, string> = { high: '高优先', medium: '中优先', low: '低优先' };

export default function OpportunitiesPage() {
  const { data, isLoading } = useQuery({ queryKey: ['content-opportunities'], queryFn: listOpportunities });

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="选题机会" description="从调研数据中发现的选题建议" />
      <div className="space-y-4">
        {data?.map((opp) => (
          <div key={opp.id} className="rounded-xl border bg-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{opp.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{opp.description}</p>
                <div className="mt-2 flex items-center gap-2">
                  {opp.priority && <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${priorityStyles[opp.priority] ?? ''}`}>{priorityLabels[opp.priority] ?? opp.priority}</span>}
                  {Array.isArray(opp.platforms) && (opp.platforms as Platform[]).map((p) => <PlatformBadge key={p} platform={p} />)}
                </div>
              </div>
              <div className="flex gap-2">
                <Link href="/content/new" className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">生成内容</Link>
                <button className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">忽略</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
