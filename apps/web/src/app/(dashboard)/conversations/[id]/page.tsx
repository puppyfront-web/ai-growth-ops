'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { getConversation, getReplySuggestions, sendReply, convertToLead, reviewReply } from '@/lib/api/conversations';
import { PageHeader } from '@/components/layout/PageHeader';
import { LoadingState } from '@/components/shared/LoadingState';
import { StatusBadge, PlatformBadge, RiskBadge, LeadLevelBadge } from '@/components/shared/StatusBadge';
import { interactionStatusLabels } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/toast';

export default function ConversationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const qc = useQueryClient();
  const router = useRouter();
  const [replyText, setReplyText] = useState('');

  const { data: conversation, isLoading } = useQuery({ queryKey: ['conversation', id], queryFn: () => getConversation(id) });
  const { data: suggestions } = useQuery({ queryKey: ['reply-suggestions', id], queryFn: () => getReplySuggestions(id) });

  const replyMutation = useMutation({
    mutationFn: (content: string) => {
      const latestInteraction = conversation?.interactions[conversation.interactions.length - 1];
      if (!latestInteraction) throw new Error('No interaction');
      return sendReply(latestInteraction.id, content);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conversation', id] }); setReplyText(''); }
  });

  const convertToLeadMutation = useMutation({
    mutationFn: () => {
      const latestInteraction = conversation?.interactions[conversation.interactions.length - 1];
      if (!latestInteraction) throw new Error('No interaction');
      return convertToLead(latestInteraction.id);
    },
    onSuccess: () => {
      toast.success('已标记为线索 — 该互动已转为线索，可在线索列表中查看');
      qc.invalidateQueries({ queryKey: ['conversation', id] });
    },
    onError: () => {
      toast.error('标记为线索失败，请重试');
    },
  });

  const transferToHumanMutation = useMutation({
    mutationFn: () => {
      const latestInteraction = conversation?.interactions[conversation.interactions.length - 1];
      if (!latestInteraction) throw new Error('No interaction');
      return reviewReply(latestInteraction.id, 'reject');
    },
    onSuccess: () => {
      toast.success('已转人工处理');
      qc.invalidateQueries({ queryKey: ['conversation', id] });
    },
    onError: () => {
      toast.error('转人工失败，请重试');
    },
  });

  if (isLoading) return <LoadingState />;
  if (!conversation) return null;

  const suggestion = suggestions?.[0];

  return (
    <div>
      <PageHeader title={conversation.externalUserName ?? conversation.externalUserId} description={`${conversation.interactions.length} 条消息`} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold mb-4">消息记录</h3>
            <div className="space-y-4">
              {conversation.interactions.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.type === 'comment' ? '' : 'pl-8'}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{msg.externalUserName}</span>
                      <PlatformBadge platform={msg.platform} />
                      <span className="text-xs text-muted-foreground">{formatDate(msg.receivedAt)}</span>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 text-sm">{msg.content}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold mb-3">回复</h3>
            <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={4} className="w-full rounded-md border p-3 text-sm" placeholder="输入回复内容..." />
            <div className="mt-3 flex gap-2">
              <button onClick={() => replyText.trim() && replyMutation.mutate(replyText)} disabled={!replyText.trim() || replyMutation.isPending} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
                {replyMutation.isPending ? '发送中...' : '发送回复'}
              </button>
              <button onClick={() => transferToHumanMutation.mutate()} disabled={transferToHumanMutation.isPending} className="rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50">
                {transferToHumanMutation.isPending ? '处理中...' : '转人工'}
              </button>
              <button onClick={() => convertToLeadMutation.mutate()} disabled={convertToLeadMutation.isPending} className="rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50">
                {convertToLeadMutation.isPending ? '处理中...' : '标记为线索'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold mb-3">AI 评估</h3>
            {suggestion ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">意图识别</span><span className="text-sm font-medium">{suggestion.intentSummary}</span></div>
                <div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">线索等级</span><LeadLevelBadge level={suggestion.leadLevel} /></div>
                <div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">置信度</span><span className="text-sm">{Math.round(suggestion.confidence * 100)}%</span></div>
                <div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">风险</span><RiskBadge level={suggestion.riskLevel} /></div>
                <div className="mt-3">
                  <span className="text-sm text-muted-foreground block mb-2">建议回复</span>
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm">{suggestion.suggestedReply || '风险过高，不建议自动回复'}</div>
                  {suggestion.suggestedReply && (
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => setReplyText(suggestion.suggestedReply)} className="text-xs text-blue-600 hover:underline">采纳此回复</button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无 AI 评估</p>
            )}
          </div>

          <div className="rounded-xl border bg-blue-50 p-4 text-xs text-blue-700">
            所有 AI 输出均可编辑、可采纳、可拒绝。高风险回复不会自动发送。
          </div>
        </div>
      </div>
    </div>
  );
}
