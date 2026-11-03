'use client';

/**
 * 评论/私信用户级黑名单控件（spec/47 G1）。
 *
 * - useTargetBlocked：查询某平台用户是否已拉黑（React Query 按用户去重）
 * - BlocklistBadge：已拉黑标签（含原因说明）
 * - BlockTargetButton：加入黑名单（L2 二次确认，破坏性操作）
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldBan } from 'lucide-react';
import { blockTarget, checkTargetBlocked } from '@/lib/api/conversations';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { toast } from '@/components/ui/toast';

const REASON_LABELS: Record<string, string> = {
  manual: '手动拉黑',
  unsubscribe: '用户退订',
  complaint: '投诉'
};

export function blocklistReasonLabel(reason: string | null | undefined): string {
  if (!reason) return '已拉黑';
  return REASON_LABELS[reason] ?? '已拉黑';
}

export function useTargetBlocked(
  platform?: string | null,
  externalUserId?: string | null
) {
  return useQuery({
    queryKey: ['interaction-blocklist', platform, externalUserId],
    queryFn: () => checkTargetBlocked(platform!, externalUserId!),
    enabled: Boolean(platform && externalUserId),
    staleTime: 30_000
  });
}

export function BlocklistBadge({ reason }: { reason?: string | null }) {
  return (
    <span
      data-testid="blocklist-badge"
      className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
    >
      <ShieldBan className="h-3 w-3" />
      已拉黑 · {blocklistReasonLabel(reason)}
    </span>
  );
}

export function BlockTargetButton({
  platform,
  externalUserId,
  displayName,
  size = 'sm',
  onBlocked
}: {
  platform: string;
  externalUserId: string;
  displayName?: string | null;
  size?: 'sm' | 'default';
  onBlocked?: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const qc = useQueryClient();

  const blockMutation = useMutation({
    mutationFn: () =>
      blockTarget({ platform, platformUserId: externalUserId, reason: 'manual' }),
    onSuccess: () => {
      toast.success('已加入黑名单，该用户不再进入回复链路');
      qc.invalidateQueries({
        queryKey: ['interaction-blocklist', platform, externalUserId]
      });
      onBlocked?.();
    },
    onError: (err: Error) => {
      toast.error(err.message || '加入黑名单失败，请重试');
    }
  });

  return (
    <>
      <Button
        size={size}
        variant="outline"
        data-testid="block-target-button"
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={blockMutation.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        <ShieldBan className="h-3.5 w-3.5" />
        加入黑名单
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="加入黑名单"
        description={`将${displayName ? ` ${displayName} ` : '该用户'}加入黑名单后，其评论/私信不再进入分类、建议与发送链路。此操作可在黑名单列表中解除。`}
        variant="destructive"
        confirmLabel="确认拉黑"
        onConfirm={() => blockMutation.mutate()}
      />
    </>
  );
}
