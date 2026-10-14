'use client';

import { Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listMediaAssets, reviewMedia } from '@/lib/api/media';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';

export default function MediaReviewPage() {
  const qc = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['media-review'],
    queryFn: () => listMediaAssets({ reviewStatus: 'pending_review' })
  });
  const reviewMutation = useMutation({
    mutationFn: ({
      id,
      status,
      note
    }: {
      id: string;
      status: 'approved' | 'rejected';
      note?: string;
    }) => reviewMedia(id, status, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media-review'] })
  });

  const pending = data ?? [];

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="素材审核"
        description={`${pending.length} 个素材待审核`}
      />
      {isLoading ? (
        <LoadingState />
      ) : pending.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          所有素材已审核完毕
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pending.map((asset) => (
            <div
              key={asset.id}
              className="rounded-xl border bg-card overflow-hidden"
            >
              <div className="aspect-video bg-muted flex items-center justify-center text-muted-foreground">
                {(asset.fileType ?? '').startsWith('image') ? (
                  <ImageIcon className="h-9 w-9" />
                ) : (
                  <VideoIcon className="h-9 w-9" />
                )}
              </div>
              <div className="p-4">
                <p className="font-medium text-sm">{asset.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {asset.fileSize
                    ? `${(asset.fileSize / 1024 / 1024).toFixed(1)}MB`
                    : '-'}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 border-success/40 text-success hover:bg-success/10 hover:text-success"
                    onClick={() =>
                      reviewMutation.mutate({
                        id: asset.id,
                        status: 'approved'
                      })
                    }
                  >
                    通过
                  </Button>
                  <Button
                    variant="ghost-destructive"
                    className="flex-1"
                    onClick={() => setRejectId(asset.id)}
                  >
                    拒绝
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setRejectId(null)}
          />
          <div className="relative z-50 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">拒绝原因</h3>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="mt-3 w-full"
              placeholder="请填写拒绝原因..."
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectId(null)}>
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  reviewMutation.mutate({
                    id: rejectId,
                    status: 'rejected',
                    note: rejectReason
                  });
                  setRejectId(null);
                  setRejectReason('');
                }}
              >
                确认拒绝
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
