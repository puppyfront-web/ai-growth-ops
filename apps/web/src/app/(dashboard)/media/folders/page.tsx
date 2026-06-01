'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listMediaAssets } from '@/lib/api/media';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { Folder, Upload, ExternalLink, Image, FileVideo, FileText } from 'lucide-react';
import type { MediaAsset } from '@/types/media';

const sourceTypeLabels: Record<string, string> = {
  uploaded: '本地上传',
  external_url: '外部链接',
  generated_future: 'AI 生成',
};

const sourceTypeIcons: Record<string, typeof Upload> = {
  uploaded: Upload,
  external_url: ExternalLink,
  generated_future: FileText,
};

export default function MediaFoldersPage() {
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const { data: assets, isLoading, error, refetch } = useQuery<MediaAsset[]>({
    queryKey: queryKeys.media.assets,
    queryFn: () => listMediaAssets(),
  });

  if (isLoading) return <LoadingState rows={4} />;
  if (error) return <ErrorState message="加载素材失败" onRetry={() => refetch()} />;

  // Group by sourceType
  const allAssets = (assets as MediaAsset[] | undefined) ?? [];
  const folders = new Map<string, MediaAsset[]>();
  for (const asset of allAssets) {
    const st = asset.sourceType ?? 'uploaded';
    const arr = folders.get(st) ?? [];
    arr.push(asset);
    folders.set(st, arr);
  }

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="素材文件夹" description="按来源类型管理素材" />

      {folders.size === 0 ? (
        <div className="py-20 text-center text-muted-foreground">暂无素材</div>
      ) : (
        <div className="space-y-4">
          {Array.from(folders.entries()).map(([sourceType, items]) => {
            const Icon = sourceTypeIcons[sourceType] ?? Folder;
            const isExpanded = expandedFolder === sourceType;

            return (
              <Card key={sourceType}>
                <CardHeader
                  className="cursor-pointer pb-3"
                  onClick={() => setExpandedFolder(isExpanded ? null : sourceType)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold">{sourceTypeLabels[sourceType] ?? sourceType}</CardTitle>
                        <span className="text-xs text-muted-foreground">{items.length} 个文件</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{isExpanded ? '收起' : '展开'}</span>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent>
                    <div className="space-y-2">
                      {items.map((asset) => (
                        <div key={asset.id} className="flex items-center justify-between rounded-lg border p-3">
                          <div className="flex items-center gap-2">
                            {(asset.fileType?.startsWith('image')) ? (
                              <Image className="h-4 w-4 text-muted-foreground" />
                            ) : (asset.fileType?.startsWith('video')) ? (
                              <FileVideo className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <FileText className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="text-sm font-medium">{asset.fileName ?? asset.id}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {asset.fileSize != null && <span className="text-xs text-muted-foreground">{(asset.fileSize / 1024).toFixed(0)} KB</span>}
                            <span className="text-xs text-muted-foreground">{formatDate(asset.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
