'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, X, Keyboard } from 'lucide-react';
import {
  listInteractions,
  reviewReply,
  getReplySuggestions
} from '@/lib/api/conversations';
import { PageHeader } from '@/components/layout/PageHeader';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge, PlatformBadge, RiskBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { toast } from '@/components/ui/toast';
import { interactionStatusLabels, platformLabels } from '@/lib/constants';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { Interaction, ReplySuggestion } from '@/types/interaction';

const REVIEW_STATUS = 'WAITING_HUMAN_REVIEW';

/* ---------- 单张审核卡 ---------- */

function ReviewCard({
  item,
  selected,
  active,
  onToggleSelect,
  onAction,
  registeringRef
}: {
  item: Interaction;
  selected: boolean;
  active: boolean;
  onToggleSelect: (id: string) => void;
  onAction: (
    id: string,
    action: 'approve' | 'reject' | 'edit',
    content?: string
  ) => void;
  registeringRef: (id: string, el: HTMLDivElement | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const { data: suggestions = [] } = useQuery({
    queryKey: ['reply-suggestions', item.id],
    queryFn: () => getReplySuggestions(item.id),
    staleTime: 60_000
  });
  const suggestion: ReplySuggestion | undefined = useMemo(
    () =>
      suggestions.find((s) => s.adopted) ?? (suggestions.length > 0 ? suggestions[0] : undefined),
    [suggestions]
  );

  return (
    <div
      ref={(el) => registeringRef(item.id, el)}
      data-active={active || undefined}
      className={cn(
        'scroll-mt-24 rounded-lg border bg-card p-4 transition-colors',
        active && 'border-primary/50 ring-1 ring-primary/30',
        item.status !== REVIEW_STATUS && 'opacity-50'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect(item.id)}
            aria-label={`选择 ${item.externalUserName ?? item.externalUserId}`}
            className="mt-0.5"
          />
          <span className="truncate text-sm font-medium">
            {item.externalUserName ?? item.externalUserId}
          </span>
          <PlatformBadge platform={item.platform} />
          <StatusBadge
            status={item.status}
            label={interactionStatusLabels[item.status] ?? item.status}
          />
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatRelativeTime(item.receivedAt)}
          </span>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed">{item.content}</p>

      {suggestion && (
        <div className="mt-3 rounded-md bg-muted/50 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">AI 建议回复</span>
            <span className="tabular-nums">
              置信度 {Math.round(suggestion.confidence * 100)}%
            </span>
            {suggestion.riskLevel && (
              <RiskBadge risk={suggestion.riskLevel} />
            )}
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
            {suggestion.suggestedReply}
          </p>
        </div>
      )}

      {editing && (
        <div className="mt-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="编辑要发送的回复内容"
            aria-label="编辑回复内容"
            autoFocus
          />
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              disabled={!draft.trim()}
              onClick={() => {
                onAction(item.id, 'edit', draft.trim());
                setEditing(false);
              }}
            >
              <Check className="h-3.5 w-3.5" />
              保存并发送
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraft('');
              }}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {!editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-success/40 text-success hover:bg-success/10 hover:text-success"
            disabled={item.status !== REVIEW_STATUS}
            onClick={() => onAction(item.id, 'approve')}
          >
            <Check className="h-3.5 w-3.5" />
            通过并发送
          </Button>
          <Button
            size="sm"
            variant="outline"
            data-edit
            disabled={item.status !== REVIEW_STATUS}
            onClick={() => {
              setDraft(suggestion?.suggestedReply ?? '');
              setEditing(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            编辑后发送
          </Button>
          <Button
            size="sm"
            variant="ghost-destructive"
            disabled={item.status !== REVIEW_STATUS}
            onClick={() => onAction(item.id, 'reject')}
          >
            <X className="h-3.5 w-3.5" />
            拒绝
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------- 页面 ---------- */

export default function ConversationReviewPage() {
  const qc = useQueryClient();
  const [platformFilter, setPlatformFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [confirmBatchReject, setConfirmBatchReject] = useState(false);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const {
    data,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['interactions-review', platformFilter],
    queryFn: () =>
      listInteractions({
        status: REVIEW_STATUS,
        platform: platformFilter || undefined
      })
  });
  const items = data ?? [];
  const pendingItems = items.filter((i) => i.status === REVIEW_STATUS);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['interactions-review'] });
    qc.invalidateQueries({ queryKey: ['interactions'] });
  }, [qc]);

  const reviewMutation = useMutation({
    mutationFn: ({
      interactionId,
      action,
      content
    }: {
      interactionId: string;
      action: 'approve' | 'reject' | 'edit';
      content?: string;
    }) => reviewReply(interactionId, action, content),
    onSuccess: (_data, variables) => {
      invalidate();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.interactionId);
        return next;
      });
    },
    onError: (err: Error) => toast.error(err.message || '操作失败，请重试')
  });

  const handleAction = useCallback(
    (
      id: string,
      action: 'approve' | 'reject' | 'edit',
      content?: string
    ) => {
      reviewMutation.mutate({ interactionId: id, action, content });
    },
    [reviewMutation]
  );

  /* 批量操作：逐条并发调用（后端无批量端点），完成后统一反馈 */
  const [batchPending, setBatchPending] = useState(false);
  const runBatch = useCallback(
    async (action: 'approve' | 'reject') => {
      const ids = [...selectedIds];
      if (ids.length === 0) return;
      setBatchPending(true);
      const results = await Promise.allSettled(
        ids.map((id) => reviewReply(id, action))
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - ok;
      if (failed === 0) toast.success(`已${action === 'approve' ? '通过' : '拒绝'} ${ok} 条回复`);
      else if (ok === 0) toast.error(`批量操作失败，请重试`);
      else toast.info(`${ok} 条成功，${failed} 条失败`);
      setSelectedIds(new Set());
      setBatchPending(false);
      invalidate();
    },
    [selectedIds, invalidate]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const registerCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  /* 键盘流：J/K 移动焦点，A 通过，R 拒绝，E 编辑（输入态跳过） */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'j' || key === 'k') {
        e.preventDefault();
        setActiveIndex((i) => {
          const next = key === 'j' ? i + 1 : i - 1;
          const clamped = Math.max(0, Math.min(next, items.length - 1));
          cardRefs.current.get(items[clamped]?.id)?.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth'
          });
          return clamped;
        });
      } else if (key === 'a' || key === 'r' || key === 'e') {
        const current = items[activeIndex];
        if (!current || current.status !== REVIEW_STATUS) return;
        e.preventDefault();
        if (key === 'a') handleAction(current.id, 'approve');
        else if (key === 'r') handleAction(current.id, 'reject');
        else {
          const el = cardRefs.current.get(current.id);
          el?.querySelector<HTMLButtonElement>('button[data-edit]')?.click();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [items, activeIndex, handleAction]);

  const allSelected =
    pendingItems.length > 0 && pendingItems.every((i) => selectedIds.has(i.id));

  return (
    <div className="pb-24">
      {/* 面包屑由 conversations/layout.tsx 提供，避免重复 */}
      <PageHeader
        title="人工确认回复"
        description={`${pendingItems.length} 条回复待审核`}
        actions={
          <NativeSelect
            value={platformFilter}
            onChange={(e) => {
              setPlatformFilter(e.target.value);
              setActiveIndex(0);
            }}
            aria-label="按平台筛选"
            className="w-36"
          >
            <option value="">全部平台</option>
            {Object.entries(platformLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </NativeSelect>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState
          message={(error as Error).message}
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="没有需要审核的回复"
          description="AI 生成的回复会在这里排队等待人工确认。"
        />
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <Checkbox
              checked={
                allSelected
                  ? true
                  : pendingItems.some((i) => selectedIds.has(i.id))
                    ? 'indeterminate'
                    : false
              }
              onCheckedChange={() => {
                setSelectedIds(
                  allSelected ? new Set() : new Set(pendingItems.map((i) => i.id))
                );
              }}
              aria-label="全选待审核回复"
            />
            <span className="text-sm text-muted-foreground">
              全选待审核（{pendingItems.length}）
            </span>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <ReviewCard
                key={item.id}
                item={item}
                selected={selectedIds.has(item.id)}
                active={index === activeIndex}
                onToggleSelect={toggleSelect}
                onAction={handleAction}
                registeringRef={registerCardRef}
              />
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Keyboard className="h-3.5 w-3.5" aria-hidden />
            <span>
              快捷键：<kbd className="rounded bg-muted px-1">J</kbd>/
              <kbd className="rounded bg-muted px-1">K</kbd> 切换 ·{' '}
              <kbd className="rounded bg-muted px-1">A</kbd> 通过 ·{' '}
              <kbd className="rounded bg-muted px-1">R</kbd> 拒绝
            </span>
          </div>
        </>
      )}

      {/* 批量操作浮动栏 */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 shadow-lg">
            <span className="text-sm tabular-nums">
              已选 {selectedIds.size} 条
            </span>
            <div className="h-5 w-px bg-border" aria-hidden />
            <Button
              size="sm"
              variant="outline"
              className="border-success/40 text-success hover:bg-success/10 hover:text-success"
              disabled={batchPending}
              loading={batchPending}
              onClick={() => runBatch('approve')}
            >
              批量通过
            </Button>
            <Button
              size="sm"
              variant="ghost-destructive"
              disabled={batchPending}
              onClick={() => setConfirmBatchReject(true)}
            >
              批量拒绝
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmBatchReject}
        onOpenChange={setConfirmBatchReject}
        title={`拒绝 ${selectedIds.size} 条回复？`}
        description="被拒绝的回复不会发送给用户，该互动将进入已忽略状态。"
        confirmLabel="批量拒绝"
        variant="destructive"
        onConfirm={() => {
          setConfirmBatchReject(false);
          runBatch('reject');
        }}
      />
    </div>
  );
}
