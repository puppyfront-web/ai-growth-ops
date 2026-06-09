'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listInteractions, reviewReply } from '@/lib/api/conversations';
import { PageHeader } from '@/components/layout/PageHeader';
import { LoadingState } from '@/components/shared/LoadingState';
import { StatusBadge, PlatformBadge } from '@/components/shared/StatusBadge';
import { interactionStatusLabels } from '@/lib/constants';
import { formatDate } from '@/lib/utils';

export default function ConversationReviewPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['interactions-review'],
    queryFn: () => listInteractions({ status: 'WAITING_HUMAN_REVIEW' })
  });
  const items = data ?? [];

  const reviewMutation = useMutation({
    mutationFn: ({
      interactionId,
      action
    }: {
      interactionId: string;
      action: 'approve' | 'reject' | 'edit';
    }) => reviewReply(interactionId, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interactions-review'] })
  });

  return (
    <div>
      <PageHeader
        title="人工确认回复"
        description={`${items.length} 条回复待审核`}
      />
      {isLoading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          没有需要审核的回复
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium">
                      {item.externalUserName ?? item.externalUserId}
                    </span>
                    <PlatformBadge platform={item.platform} />
                    <StatusBadge
                      status={item.status}
                      label={
                        interactionStatusLabels[item.status] ?? item.status
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      {formatDate(item.receivedAt)}
                    </span>
                  </div>
                  <p className="text-sm">{item.content}</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() =>
                    reviewMutation.mutate({
                      interactionId: item.id,
                      action: 'approve'
                    })
                  }
                  disabled={reviewMutation.isPending}
                  className="rounded-md bg-green-600 px-4 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                >
                  通过并发送
                </button>
                <button
                  onClick={() =>
                    reviewMutation.mutate({
                      interactionId: item.id,
                      action: 'edit'
                    })
                  }
                  disabled={reviewMutation.isPending}
                  className="rounded-md border px-4 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                >
                  编辑后发送
                </button>
                <button
                  onClick={() =>
                    reviewMutation.mutate({
                      interactionId: item.id,
                      action: 'reject'
                    })
                  }
                  disabled={reviewMutation.isPending}
                  className="rounded-md border px-4 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                >
                  拒绝
                </button>
                <button className="rounded-md border px-4 py-1.5 text-sm hover:bg-accent">
                  转销售处理
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
