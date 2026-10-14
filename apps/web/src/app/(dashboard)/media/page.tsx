'use client';

import { Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { listMediaAssets } from '@/lib/api/media';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { mediaReviewStatusLabels } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';
import Link from 'next/link';
import { useState } from 'react';
import { NativeSelect } from '@/components/ui/native-select';

export default function MediaPage() {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sourceType, setSourceType] = useState('');
  const [filter, setFilter] = useState<string>('');
  const { data, isLoading } = useQuery({
    queryKey: ['media-assets', filter, sourceType],
    queryFn: () =>
      listMediaAssets({ reviewStatus: filter || undefined, sourceType: sourceType || undefined })
  });

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="素材库"
        actions={
          <div className="flex gap-2">
            <Link
              href="/media/upload"
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              上传素材
            </Link>
            <Link
              href="/media/review"
              className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
            >
              审核素材
            </Link>
          </div>
        }
      />

      <div className="flex gap-2 mb-4">
        <NativeSelect
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border p-2 text-sm"
        >
          <option value="">全部状态</option>
          <option value="pending_review">待审核</option>
          <option value="approved">已通过</option>
          <option value="rejected">已拒绝</option>
        </NativeSelect>
        <NativeSelect aria-label="素材来源" value={sourceType} onChange={(event) => setSourceType(event.target.value)} className="rounded-md border p-2 text-sm">
          <option value="">全部来源</option>
          <option value="uploaded">本地上传</option>
          <option value="external_url">外部链接</option>
          <option value="generated_future">AI 生成</option>
        </NativeSelect>
        <div className="flex rounded-md border">
          <button
            onClick={() => setView('grid')}
            className={`px-3 py-2 text-sm ${view === 'grid' ? 'bg-accent' : ''}`}
          >
            网格
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-3 py-2 text-sm ${view === 'list' ? 'bg-accent' : ''}`}
          >
            列表
          </button>
        </div>
      </div>

      {isLoading && <LoadingState />}

      {view === 'grid' && data && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          {data.map((asset) => (
            <div
              key={asset.id}
              className="rounded-xl border bg-card overflow-hidden"
            >
              <div className="aspect-square bg-muted flex items-center justify-center text-muted-foreground">
                {(asset.fileType ?? '').startsWith('image') ? (
                  <ImageIcon className="h-8 w-8" />
                ) : (
                  <VideoIcon className="h-8 w-8" />
                )}
              </div>
              <div className="p-3">
                <p className="text-sm font-medium truncate">{asset.fileName}</p>
                <div className="mt-1 flex items-center justify-between">
                  <StatusBadge
                    status={asset.reviewStatus}
                    label={mediaReviewStatusLabels[asset.reviewStatus]}
                  />
                  <span className="text-xs text-muted-foreground">
                    {asset.fileSize
                      ? `${(asset.fileSize / 1024 / 1024).toFixed(1)}MB`
                      : '-'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'list' && data && (
        <div className="rounded-xl border bg-card">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  文件名
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  类型
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  审核状态
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  大小
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  上传时间
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((asset) => (
                <tr
                  key={asset.id}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 text-sm font-medium">
                    {asset.fileName}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {(asset.fileType ?? '').startsWith('image')
                      ? '图片'
                      : '视频'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={asset.reviewStatus}
                      label={mediaReviewStatusLabels[asset.reviewStatus]}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {asset.fileSize
                      ? `${(asset.fileSize / 1024 / 1024).toFixed(1)}MB`
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatDateTime(asset.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
