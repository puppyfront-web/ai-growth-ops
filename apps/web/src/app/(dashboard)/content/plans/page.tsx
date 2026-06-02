'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listContentItems } from '@/lib/api/content';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { contentStatusLabels, contentTypeLabels } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { ContentItem } from '@/types/content';
import type { ContentStatus } from '@/types/enums';

const columns: { key: ContentStatus; label: string; color: string }[] = [
  { key: 'draft', label: '草稿', color: 'bg-gray-50 border-gray-200' },
  { key: 'ready', label: '就绪', color: 'bg-blue-50 border-blue-200' },
  { key: 'archived', label: '已归档', color: 'bg-emerald-50 border-emerald-200' },
];

function PlanCard({ item }: { item: ContentItem }) {
  return (
    <Link href={`/content/${item.id}`} className="block rounded-lg border bg-card p-3 transition-shadow hover:shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="line-clamp-1 text-sm font-medium">{item.title}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{contentTypeLabels[item.type] ?? item.type}</span>
        <span className="text-xs text-muted-foreground">{item.contentVariants?.length ?? 0} 个变体</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{formatDate(item.createdAt)}</div>
    </Link>
  );
}

export default function ContentPlansPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.content.items,
    queryFn: () => listContentItems(),
  });
  const items = data?.items ?? [];

  if (isLoading) return <LoadingState rows={4} />;
  if (error) return <ErrorState message="加载内容计划失败" onRetry={() => refetch()} />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="内容计划" description="按状态管理内容创作进度" actions={
        <Button size="sm" asChild>
          <Link href="/content/new"><Plus className="mr-1 h-4 w-4" />新建内容</Link>
        </Button>
      } />

      <div className="grid grid-cols-3 gap-3 overflow-x-auto">
        {columns.map((col) => {
          const colItems = items.filter((i) => i.status === col.key);
          return (
            <div key={col.key} className="min-w-[220px]">
              <div className={`rounded-t-lg border p-3 ${col.color}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{col.label}</span>
                  <span className="text-xs text-muted-foreground">{colItems.length}</span>
                </div>
              </div>
              <div className="min-h-[300px] space-y-2 rounded-b-lg border border-t-0 bg-muted/30 p-2">
                {colItems.map((item) => (
                  <PlanCard key={item.id} item={item} />
                ))}
                {colItems.length === 0 && (
                  <p className="py-8 text-center text-xs text-muted-foreground">暂无{col.label}内容</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
