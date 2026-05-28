'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listMediaAssets, reviewMedia } from '@/lib/api/media';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { mediaReviewStatusLabels } from '@/lib/constants';
import { useState } from 'react';

export default function MediaReviewPage() {
  const qc = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['media-review'], queryFn: () => listMediaAssets({ reviewStatus: 'pending_review' }) });
  const reviewMutation = useMutation({ mutationFn: ({ id, status, note }: { id: string; status: 'approved' | 'rejected'; note?: string }) => reviewMedia(id, status, note), onSuccess: () => qc.invalidateQueries({ queryKey: ['media-review'] }) });

  const pending = data ?? [];

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="素材审核" description={`${pending.length} 个素材待审核`} />
      {isLoading ? <LoadingState /> : pending.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">所有素材已审核完毕</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pending.map((asset) => (
            <div key={asset.id} className="rounded-xl border bg-card overflow-hidden">
              <div className="aspect-video bg-muted flex items-center justify-center text-3xl">{(asset.fileType ?? '').startsWith('image') ? '🖼️' : '🎬'}</div>
              <div className="p-4">
                <p className="font-medium text-sm">{asset.fileName}</p>
                <p className="text-xs text-muted-foreground">{asset.fileSize ? `${(asset.fileSize / 1024 / 1024).toFixed(1)}MB` : '-'}</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => reviewMutation.mutate({ id: asset.id, status: 'approved' })} className="flex-1 rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700">通过</button>
                  <button onClick={() => setRejectId(asset.id)} className="flex-1 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700">拒绝</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setRejectId(null)} />
          <div className="relative z-50 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">拒绝原因</h3>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className="mt-3 w-full rounded-md border p-2 text-sm" placeholder="请填写拒绝原因..." />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRejectId(null)} className="rounded-md border px-4 py-2 text-sm">取消</button>
              <button onClick={() => { reviewMutation.mutate({ id: rejectId, status: 'rejected', note: rejectReason }); setRejectId(null); setRejectReason(''); }} className="rounded-md bg-red-600 px-4 py-2 text-sm text-white">确认拒绝</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
