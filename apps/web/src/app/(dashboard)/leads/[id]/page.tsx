'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getLead, getLeadActivities, updateLeadStatus, syncLeadToFeishu, syncLeadToWecom } from '@/lib/api/leads';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { StatusBadge, PlatformBadge, LeadLevelBadge, RiskBadge } from '@/components/shared/StatusBadge';
import { formatDate } from '@/lib/utils';

const leadStatusLabels: Record<string, string> = {
  NEW: '新线索', QUALIFIED: '已验证', SYNCING: '同步中', SYNCED: '已同步飞书', ASSIGNED: '已分配', CONTACTED: '已联系', ADDED_WECOM: '已加企微', WON: '已成交', LOST: '已流失', INVALID: '无效',
};
const statusFlow = ['NEW', 'QUALIFIED', 'ASSIGNED', 'CONTACTED', 'ADDED_WECOM', 'WON'];

export default function LeadDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const qc = useQueryClient();

  const { data: lead, isLoading } = useQuery({ queryKey: ['lead', id], queryFn: () => getLead(id) });
  const { data: activities } = useQuery({ queryKey: ['lead-activities', id], queryFn: () => getLeadActivities(id) });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateLeadStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead', id] })
  });

  const syncFeishuMutation = useMutation({
    mutationFn: () => syncLeadToFeishu(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead', id] })
  });

  const syncWecomMutation = useMutation({
    mutationFn: () => syncLeadToWecom(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead', id] })
  });

  if (isLoading) return <LoadingState />;
  if (!lead) return null;

  const nextStatus = statusFlow[statusFlow.indexOf(lead.status) + 1];

  return (
    <div>
      <Breadcrumb />
      <PageHeader title={lead.externalUserName ?? lead.externalUserId} actions={
        <div className="flex gap-2">
          <button onClick={() => syncFeishuMutation.mutate()} disabled={syncFeishuMutation.isPending} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50">
            {syncFeishuMutation.isPending ? '同步中...' : '同步飞书'}
          </button>
          <button onClick={() => syncWecomMutation.mutate()} disabled={syncWecomMutation.isPending} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50">
            {syncWecomMutation.isPending ? '同步中...' : '同步企微'}
          </button>
          {nextStatus && (
            <button onClick={() => statusMutation.mutate(nextStatus)} disabled={statusMutation.isPending} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
              {statusMutation.isPending ? '更新中...' : `更新为${leadStatusLabels[nextStatus]}`}
            </button>
          )}
        </div>
      } />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold">基础信息</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">线索等级</span><div><LeadLevelBadge level={lead.level} /></div></div>
            <div><span className="text-muted-foreground">来源平台</span><div><PlatformBadge platform={lead.sourcePlatform} /></div></div>
            <div><span className="text-muted-foreground">跟进状态</span><div><StatusBadge status={lead.status} label={leadStatusLabels[lead.status]} /></div></div>
            <div><span className="text-muted-foreground">负责人</span><div>{lead.assignedTo ?? '未分配'}</div></div>
            <div><span className="text-muted-foreground">需求</span><div>{lead.intent ?? '-'}</div></div>
            <div><span className="text-muted-foreground">置信度</span><div>{lead.confidence ? `${Math.round(lead.confidence * 100)}%` : '-'}</div></div>
            <div><span className="text-muted-foreground">风险等级</span><div>{lead.riskLevel ? <RiskBadge level={lead.riskLevel} /> : '-'}</div></div>
            <div><span className="text-muted-foreground">创建时间</span><div>{formatDate(lead.createdAt)}</div></div>
          </div>
          {lead.summary && <div className="mt-3"><span className="text-sm text-muted-foreground">摘要</span><p className="mt-1 text-sm">{lead.summary}</p></div>}

          {/* Source traceability */}
          {(lead.sourceInteractionId || lead.sourcePublishJobId) && (
            <div className="mt-4 rounded-lg border-t pt-3">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">来源追踪</h4>
              <div className="flex flex-wrap gap-3 text-sm">
                {lead.sourceInteractionId && (
                  <Link
                    href={`/conversations/${lead.sourceInteractionId}`}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    <span>💬</span>
                    <span>查看来源互动</span>
                  </Link>
                )}
                {lead.sourcePublishJobId && (
                  <Link
                    href={`/publish/jobs/${lead.sourcePublishJobId}`}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-emerald-700 hover:bg-emerald-100 transition-colors"
                  >
                    <span>📤</span>
                    <span>查看来源发布</span>
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">跟进记录</h3>
          {activities && activities.length > 0 ? (
            <div className="space-y-3">
              {activities.map((activity) => (
                <div key={activity.id} className="flex gap-3 border-l-2 border-primary/30 pl-3">
                  <div>
                    <div className="text-sm font-medium">{activity.action}</div>
                    {activity.note && <div className="text-sm text-muted-foreground">{activity.note}</div>}
                    <div className="text-xs text-muted-foreground mt-1">{formatDate(activity.createdAt)} · {activity.operator}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">暂无跟进记录</p>
          )}
        </div>
      </div>
    </div>
  );
}
