'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { listContentItems } from '@/lib/api/content';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { contentTypeLabels } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { Copy, Plus } from 'lucide-react';
import type { ContentItem } from '@/types/content';

export default function ContentTemplatesPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.content.items,
    queryFn: () => listContentItems()
  });

  // Templates = content items with status 'ready' that have variants
  const templates = (data?.items ?? []).filter(
    (item: ContentItem) =>
      item.status === 'ready' && (item.contentVariants?.length ?? 0) > 0
  );

  if (isLoading) return <LoadingState rows={4} />;
  if (error)
    return <ErrorState message="加载模板失败" onRetry={() => refetch()} />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="内容模板"
        description="管理可复用的内容模板"
        actions={
          <Button size="sm" asChild>
            <Link href="/content/new">
              <Plus className="mr-1 h-4 w-4" />
              新建模板
            </Link>
          </Button>
        }
      />

      {templates.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-muted-foreground mb-4">暂无内容模板</p>
          <p className="text-xs text-muted-foreground">
            内容变为「就绪」状态并生成平台变体后，将自动成为可复用模板
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border bg-card p-4 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium line-clamp-1">
                  {item.title}
                </h3>
                <StatusBadge status={item.status} label="就绪" />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                <span>{contentTypeLabels[item.type] ?? item.type}</span>
                <span>{item.contentVariants?.length ?? 0} 个平台变体</span>
              </div>
              <div className="text-xs text-muted-foreground mb-3">
                {formatDate(item.createdAt)}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="text-xs" asChild>
                  <Link href={`/content/${item.id}`}>
                    <Copy className="mr-1 h-3 w-3" />
                    使用模板
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
