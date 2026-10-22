'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import Link from 'next/link';
import {
  getLead,
  getLeadActivities,
  updateLead,
  updateLeadStatus,
  updateLeadLevel,
  assignLead,
  addLeadActivity,
  syncLeadToFeishu,
  syncLeadToWecom
} from '@/lib/api/leads';
import { useOrgMembers } from '@/hooks/use-org-members';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import {
  StatusBadge,
  PlatformBadge,
  LeadLevelBadge,
  RiskBadge
} from '@/components/shared/StatusBadge';
import { formatDateTime } from '@/lib/utils';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';

const leadStatusLabels: Record<string, string> = {
  NEW: '新线索',
  QUALIFIED: '已验证',
  SYNCING: '同步中',
  SYNCED: '已同步飞书',
  ASSIGNED: '已分配',
  CONTACTED: '已联系',
  ADDED_WECOM: '已加企微',
  WON: '已成交',
  LOST: '已流失',
  INVALID: '无效'
};
function toLocalDateTimeInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const statusFlow = [
  'NEW',
  'QUALIFIED',
  'ASSIGNED',
  'CONTACTED',
  'ADDED_WECOM',
  'WON'
];

export default function LeadDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const qc = useQueryClient();

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => getLead(id)
  });
  const { data: activities } = useQuery({
    queryKey: ['lead-activities', id],
    queryFn: () => getLeadActivities(id)
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateLeadStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['deals-pipeline'] });
      qc.invalidateQueries({ queryKey: ['analytics', 'funnel'] });
    }
  });

  const syncFeishuMutation = useMutation({
    mutationFn: () => syncLeadToFeishu(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead', id] })
  });

  const syncWecomMutation = useMutation({
    mutationFn: () => syncLeadToWecom(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead', id] })
  });

  const levelMutation = useMutation({
    mutationFn: (level: 'A' | 'B' | 'C' | 'D') => updateLeadLevel(id, level),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead', id] })
  });
  const { data: members = [] } = useOrgMembers();
  const assignMutation = useMutation({
    mutationFn: (assignedTo: string) => assignLead(id, assignedTo),
    onSuccess: () => {
      toast.success('已更新负责人');
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['lead-activities', id] });
    },
    onError: (error: Error) => toast.error(error.message || '分配失败')
  });
  const [nextActionDraft, setNextActionDraft] = useState('');
  const [nextActionAtDraft, setNextActionAtDraft] = useState('');
  useEffect(() => {
    setNextActionDraft(lead?.nextAction ?? '');
    setNextActionAtDraft(toLocalDateTimeInput(lead?.nextActionAt ?? null));
  }, [lead?.id, lead?.nextAction, lead?.nextActionAt]);

  const nextActionMutation = useMutation({
    mutationFn: () =>
      updateLead(id, {
        nextAction: nextActionDraft.trim(),
        nextActionAt: nextActionAtDraft
          ? new Date(nextActionAtDraft).toISOString()
          : null
      }),
    onSuccess: () => {
      toast.success('下一步已更新');
      qc.invalidateQueries({ queryKey: ['lead', id] });
    },
    onError: (error: Error) => toast.error(error.message || '更新失败')
  });
  const [followUp, setFollowUp] = useState('');
  const [followUpAction, setFollowUpAction] = useState('电话沟通');
  const activityMutation = useMutation({
    mutationFn: () => addLeadActivity(id, followUpAction, followUp),
    onSuccess: () => {
      setFollowUp('');
      qc.invalidateQueries({ queryKey: ['lead-activities', id] });
    }
  });

  if (isLoading) return <LoadingState />;
  if (!lead) return null;

  const nextStatus = statusFlow[statusFlow.indexOf(lead.status) + 1];

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title={lead.externalUserName ?? lead.externalUserId}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncFeishuMutation.mutate()}
              disabled={syncFeishuMutation.isPending}
              loading={syncFeishuMutation.isPending}
            >
              {syncFeishuMutation.isPending ? '同步中...' : '同步飞书'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncWecomMutation.mutate()}
              disabled={syncWecomMutation.isPending}
              loading={syncWecomMutation.isPending}
            >
              {syncWecomMutation.isPending ? '同步中...' : '同步企微'}
            </Button>
            {nextStatus && (
              <Button
                size="sm"
                onClick={() => statusMutation.mutate(nextStatus)}
                disabled={statusMutation.isPending}
                loading={statusMutation.isPending}
              >
                {statusMutation.isPending
                  ? '更新中...'
                  : `更新为${leadStatusLabels[nextStatus]}`}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold">基础信息</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">线索等级</span>
              <div className="flex items-center gap-2">
                <LeadLevelBadge level={lead.level} />
                <NativeSelect
                  value={lead.level}
                  onChange={(e) =>
                    levelMutation.mutate(e.target.value as 'A' | 'B' | 'C' | 'D')
                  }
                  disabled={levelMutation.isPending}
                  className="rounded border bg-background px-1.5 py-0.5 text-xs"
                  title="调整线索等级"
                >
                  {(['A', 'B', 'C', 'D'] as const).map((lv) => (
                    <option key={lv} value={lv}>
                      {lv} 级
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">来源平台</span>
              <div>
                <PlatformBadge platform={lead.sourcePlatform} />
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">跟进状态</span>
              <div>
                <StatusBadge
                  status={lead.status}
                  label={leadStatusLabels[lead.status]}
                />
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">负责人</span>
              <NativeSelect
                value={lead.assignedTo ?? ''}
                onChange={(event) =>
                  assignMutation.mutate(event.target.value)
                }
                disabled={assignMutation.isPending}
                className="w-36 rounded border bg-background px-1.5 py-0.5 text-xs"
                title="分配给团队成员"
              >
                <option value="">未分配</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <span className="text-muted-foreground">下次动作</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  value={nextActionDraft}
                  onChange={(event) => setNextActionDraft(event.target.value)}
                  placeholder="如：电话回访"
                  className="w-32 rounded border bg-background px-1.5 py-0.5 text-xs"
                />
                <input
                  type="datetime-local"
                  value={nextActionAtDraft}
                  onChange={(event) => setNextActionAtDraft(event.target.value)}
                  className="rounded border bg-background px-1.5 py-0.5 text-xs"
                />
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => nextActionMutation.mutate()}
                  loading={nextActionMutation.isPending}
                >
                  保存
                </Button>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">需求</span>
              <div>{lead.intent ?? '-'}</div>
            </div>
            <div>
              <span className="text-muted-foreground">置信度</span>
              <div>
                {lead.confidence
                  ? `${Math.round(lead.confidence * 100)}%`
                  : '-'}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">风险等级</span>
              <div>
                {lead.riskLevel ? <RiskBadge level={lead.riskLevel} /> : '-'}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">创建时间</span>
              <div>{formatDateTime(lead.createdAt)}</div>
            </div>
          </div>
          {lead.summary && (
            <div className="mt-3">
              <span className="text-sm text-muted-foreground">摘要</span>
              <p className="mt-1 text-sm">{lead.summary}</p>
            </div>
          )}

          {/* Source traceability */}
          {(lead.sourceInteractionId || lead.sourcePublishJobId) && (
            <div className="mt-4 rounded-lg border-t pt-3">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                来源追踪
              </h4>
              <div className="flex flex-wrap gap-3 text-sm">
                {lead.sourceInteractionId && (
                  <Link
                    href={`/conversations/${lead.sourceInteractionId}`}
                    className="inline-flex items-center gap-1 rounded-md bg-info/10 px-2.5 py-1 text-info hover:bg-info/20 transition-colors"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>查看来源互动</span>
                  </Link>
                )}
                {lead.sourcePublishJobId && (
                  <Link
                    href={`/publish/jobs/${lead.sourcePublishJobId}`}
                    className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2.5 py-1 text-success hover:bg-success/20 transition-colors"
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

          {/* Add follow-up entry */}
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2">
            <NativeSelect
              value={followUpAction}
              onChange={(e) => setFollowUpAction(e.target.value)}
              className="rounded border bg-background px-2 py-1 text-xs"
            >
              {[
                '电话沟通',
                '微信联系',
                '已拜访',
                '发资料',
                '报价',
                '其他'
              ].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </NativeSelect>
            <input
              type="text"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              placeholder="记录跟进详情…"
              className="min-w-[180px] flex-1 rounded border bg-background px-2 py-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && followUp.trim()) {
                  activityMutation.mutate();
                }
              }}
            />
            <Button
              size="xs"
              onClick={() => followUp.trim() && activityMutation.mutate()}
              disabled={!followUp.trim() || activityMutation.isPending}
            >
              添加
            </Button>
          </div>

          {activities && activities.length > 0 ? (
            <div className="space-y-3">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex gap-3 border-l-2 border-primary/30 pl-3"
                >
                  <div>
                    <div className="text-sm font-medium">{activity.action}</div>
                    {activity.note && (
                      <div className="text-sm text-muted-foreground">
                        {activity.note}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDateTime(activity.createdAt)} · {activity.operator}
                    </div>
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
