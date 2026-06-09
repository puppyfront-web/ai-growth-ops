'use client';

import { useQuery } from '@tanstack/react-query';
import { listInteractions } from '@/lib/api/conversations';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import {
  StatusBadge,
  PlatformBadge,
  RiskBadge
} from '@/components/shared/StatusBadge';
import { interactionStatusLabels } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import type { Interaction } from '@/types/interaction';
import Link from 'next/link';
import { useState } from 'react';

const typeLabels: Record<string, string> = {
  comment: '评论',
  message: '私信',
  official_message: '公号消息',
  form_submission: '表单'
};

const columns: ColumnDef<Interaction>[] = [
  {
    accessorKey: 'externalUserName',
    header: '用户',
    cell: ({ row }) => (
      <Link
        href={`/conversations/${row.original.conversationId ?? row.original.id}`}
        className="font-medium text-sm hover:underline"
      >
        {row.original.externalUserName}
      </Link>
    )
  },
  {
    accessorKey: 'platform',
    header: '平台',
    cell: ({ getValue }) => <PlatformBadge platform={getValue() as string} />
  },
  {
    accessorKey: 'type',
    header: '类型',
    cell: ({ getValue }) => (
      <span className="text-sm">
        {typeLabels[getValue() as string] ?? (getValue() as string)}
      </span>
    )
  },
  {
    accessorKey: 'content',
    header: '内容摘要',
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground line-clamp-1 max-w-xs">
        {getValue() as string}
      </span>
    )
  },
  {
    accessorKey: 'riskLevel',
    header: '风险',
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      return v ? (
        <RiskBadge level={v} />
      ) : (
        <span className="text-xs text-muted-foreground">-</span>
      );
    }
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ getValue }) => (
      <StatusBadge
        status={getValue() as string}
        label={
          interactionStatusLabels[
            getValue() as keyof typeof interactionStatusLabels
          ]
        }
      />
    )
  },
  {
    accessorKey: 'receivedAt',
    header: '时间',
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">
        {formatDate(getValue() as string)}
      </span>
    )
  }
];

export default function ConversationsPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['interactions', filters],
    queryFn: () => listInteractions(filters)
  });

  return (
    <div>
      <PageHeader
        title="评论私信"
        description="统一管理所有平台的评论和私信"
        actions={
          <Link
            href="/conversations/review"
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            审核回复
          </Link>
        }
      />
      <div className="flex gap-2 mb-4">
        <select
          value={filters.platform ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, platform: e.target.value }))
          }
          className="rounded-md border p-2 text-sm"
        >
          <option value="">全部平台</option>
          <option value="douyin">抖音</option>
          <option value="xiaohongshu">小红书</option>
          <option value="wechat_official">公众号</option>
          <option value="wechat_channels">视频号</option>
          <option value="baijiahao">百家号</option>
          <option value="zhihu">知乎</option>
        </select>
        <select
          value={filters.status ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, status: e.target.value }))
          }
          className="rounded-md border p-2 text-sm"
        >
          <option value="">全部状态</option>
          <option value="NEW">新消息</option>
          <option value="WAITING_HUMAN_REVIEW">待审核</option>
          <option value="REPLY_SUGGESTED">已建议回复</option>
          <option value="REPLIED">已回复</option>
        </select>
      </div>
      <DataTable
        columns={columns}
        data={data ?? []}
        loading={isLoading}
        error={error?.message}
        onRetry={() => refetch()}
        emptyTitle="暂无消息"
        emptyDescription="新评论和私信将在这里显示"
      />
    </div>
  );
}
