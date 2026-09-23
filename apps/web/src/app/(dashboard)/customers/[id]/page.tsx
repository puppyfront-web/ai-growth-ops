'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getTeamMembers } from '@/lib/api/settings';
import {
  getCustomer,
  addCustomerActivity,
  updateCustomer,
  refreshCustomerProfile,
  getCustomerPlaybook,
  generateCustomerPlaybook,
  syncCustomerToFeishu
} from '@/lib/api/customers';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { formatDate } from '@/lib/utils';
import type { PlaybookAction } from '@/types/customer';
import {
  CHANNEL_LABELS,
  CUSTOMER_STATUSES,
  CustomerEditor,
  STATUS_LABELS,
  formFromCustomer,
  isUnfilled,
  type CustomerFormValues
} from '@/components/customers/CustomerEditor';

const segmentLabels: Record<string, string> = {
  hot: '高意向',
  warm: '可培育',
  cold: '低活跃',
  at_risk: '流失风险'
};

const actionTypeLabels: Record<string, string> = {
  call: '电话',
  wecom_message: '企微消息',
  email: '邮件',
  meeting: '会议',
  send_material: '发送资料',
  follow_up_note: '跟进记录'
};

const priorityLabels: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低'
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

export default function CustomerDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CustomerFormValues | null>(null);

  const {
    data: customer,
    isLoading,
    error: customerError,
    refetch: refetchCustomer
  } = useQuery({
    queryKey: ['customers', id],
    queryFn: () => getCustomer(id)
  });
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team', 'members'],
    queryFn: getTeamMembers
  });
  const assigneeName =
    teamMembers.find((m) => m.id === customer?.assignedTo)?.name ?? null;

  const activityMutation = useMutation({
    mutationFn: () => addCustomerActivity(id, 'follow_up', note.trim()),
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['customers', id] });
    }
  });

  const feishuSyncMutation = useMutation({
    mutationFn: () => syncCustomerToFeishu(id),
    onSuccess: (result) => {
      toast.success('已同步到飞书多维表格');
      if (result.externalUrl) {
        window.open(result.externalUrl, '_blank', 'noopener,noreferrer');
      }
      qc.invalidateQueries({ queryKey: ['customers', id] });
    },
    onError: (err: Error) => {
      toast.error(err.message || '飞书同步失败');
    }
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!form) throw new Error('表单未就绪');
      return updateCustomer(id, {
        displayName: form.displayName.trim(),
        phone: form.phone.trim(),
        company: form.company.trim(),
        role: form.role.trim(),
        intent: form.intent.trim(),
        channel: form.channel,
        sourceNote: form.sourceNote,
        status: form.status,
        assignedTo: form.assignedTo || undefined
      });
    },
    onSuccess: () => {
      setEditing(false);
      setForm(null);
      qc.invalidateQueries({ queryKey: ['customers'] });
    }
  });

  const statusMutation = useMutation({
    mutationFn: (status: (typeof CUSTOMER_STATUSES)[number]) =>
      updateCustomer(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] })
  });

  const profileMutation = useMutation({
    mutationFn: () => refreshCustomerProfile(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', id] });
      qc.invalidateQueries({ queryKey: ['customers', id, 'playbook'] });
    }
  });

  const { data: playbookData, isLoading: playbookLoading } = useQuery({
    queryKey: ['customers', id, 'playbook'],
    queryFn: () => getCustomerPlaybook(id)
  });

  const generatePlaybookMutation = useMutation({
    mutationFn: () => generateCustomerPlaybook(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['customers', id, 'playbook'] })
  });

  const playbook = playbookData?.playbook ?? null;
  const playbookActions = (playbook?.actions ?? []) as PlaybookAction[];

  if (isLoading) return <LoadingState />;
  if (customerError) {
    return (
      <div className="p-6 text-sm text-destructive">
        客户数据加载失败。
        <button onClick={() => refetchCustomer()} className="ml-2 underline">
          重试
        </button>
      </div>
    );
  }
  if (!customer) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        客户不存在。
        <Link href="/customers" className="ml-2 text-primary hover:underline">
          返回列表
        </Link>
      </div>
    );
  }

  const profile = customer.profile;
  const painPoints = (profile?.painPoints as string[] | undefined) ?? [];
  const interests = (profile?.interests as string[] | undefined) ?? [];
  const tags = (profile?.tags as string[] | undefined) ?? [];
  const customerTags = Array.isArray(customer.tags)
    ? (customer.tags as string[])
    : [];
  const feishuUrl = customer.metadata?.lark?.externalUrl ?? null;

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title={customer.displayName}
        description={`${customer.company} · ${customer.role}`}
        actions={
          <div className="flex items-center gap-2">
            {customerTags.includes('待跟进') && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                待跟进
              </span>
            )}
            {customerTags.includes('获客转入') && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                获客转入
              </span>
            )}
            {feishuUrl && (
              <a
                href={feishuUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              >
                打开飞书记录
              </a>
            )}
            <button
              type="button"
              onClick={() => feishuSyncMutation.mutate()}
              disabled={feishuSyncMutation.isPending}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            >
              {feishuSyncMutation.isPending ? '同步中…' : '同步飞书'}
            </button>
            {customer.metadata?.lark?.syncedAt &&
              customer.metadata.lark.lastSuccess !== false && (
                <span className="text-xs text-muted-foreground">
                  飞书已同步
                </span>
              )}
            <Link
              href="/customers"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            >
              返回列表
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <section className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">基本信息</h2>
              {!editing && (
                <button
                  type="button"
                  onClick={() => {
                    setForm(formFromCustomer(customer));
                    setEditing(true);
                  }}
                  className="rounded border px-2 py-1 text-xs hover:bg-accent"
                >
                  编辑
                </button>
              )}
            </div>
            {editing && form ? (
              <div className="space-y-3">
                <CustomerEditor
                  value={form}
                  onChange={setForm}
                  showStatus
                  showAssignee
                  assigneeOptions={teamMembers.map((m) => ({
                    id: m.id,
                    name: m.name
                  }))}
                  idPrefix="customer-detail"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      form.displayName.trim() &&
                      form.intent.trim() &&
                      updateMutation.mutate()
                    }
                    disabled={
                      !form.displayName.trim() ||
                      !form.intent.trim() ||
                      updateMutation.isPending
                    }
                    className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                  >
                    {updateMutation.isPending ? '保存中…' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setForm(null);
                    }}
                    className="rounded border px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    取消
                  </button>
                </div>
                {updateMutation.isError && (
                  <p className="text-sm text-destructive">
                    {(updateMutation.error as Error).message}
                  </p>
                )}
              </div>
            ) : (
            <dl className="grid gap-2 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-muted-foreground">手机号</dt>
                <dd>
                  {isUnfilled(customer.phone) ? (
                    <span className="text-amber-700">待补充（需人工跟进）</span>
                  ) : (
                    customer.phone
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">来源</dt>
                <dd>{CHANNEL_LABELS[customer.channel] ?? customer.channel}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">负责人</dt>
                <dd>{assigneeName ?? '未分配'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">公司</dt>
                <dd>
                  {isUnfilled(customer.company) ? (
                    <span className="text-amber-700">待补充</span>
                  ) : (
                    customer.company
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">职位</dt>
                <dd>
                  {isUnfilled(customer.role) ? (
                    <span className="text-amber-700">待补充</span>
                  ) : (
                    customer.role
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">需求</dt>
                <dd>{customer.intent}</dd>
              </div>
              {customer.metadata?.prospectingTaskId && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">获客任务</dt>
                  <dd>
                    <Link
                      href={
                        customer.metadata.prospectCandidateId
                          ? `/prospecting/${customer.metadata.prospectingTaskId}#candidate-${customer.metadata.prospectCandidateId}`
                          : `/prospecting/${customer.metadata.prospectingTaskId}`
                      }
                      className="text-primary hover:underline"
                    >
                      查看来源任务
                    </Link>
                    {customer.metadata.leadLevel
                      ? ` · ${customer.metadata.leadLevel}级潜客`
                      : ''}
                  </dd>
                </div>
              )}
              {customer.crm?.conversation && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">评论私信</dt>
                  <dd>
                    <Link
                      href={`/conversations/${customer.crm.conversation.id}`}
                      className="text-primary hover:underline"
                    >
                      打开会话
                    </Link>
                  </dd>
                </div>
              )}
              {customer.sourceNote && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">来源说明</dt>
                  <dd className="whitespace-pre-wrap">{customer.sourceNote}</dd>
                </div>
              )}
            </dl>
            )}
          </section>

          <section className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">客户画像</h2>
              <button
                onClick={() => profileMutation.mutate()}
                disabled={profileMutation.isPending}
                className="rounded border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
              >
                {profileMutation.isPending ? '刷新中…' : '刷新画像'}
              </button>
            </div>
            {profile ? (
              <div className="space-y-3 text-sm">
                <p>{profile.summary}</p>
                {painPoints.length > 0 && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">痛点</p>
                    <div className="flex flex-wrap gap-1">
                      {painPoints.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {interests.length > 0 && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">兴趣</p>
                    <div className="flex flex-wrap gap-1">
                      {interests.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {tags.length > 0 && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">标签</p>
                    <div className="flex flex-wrap gap-1">
                      {tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border px-2 py-0.5 text-xs"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  来源：{profile.source === 'skill' ? 'AI 抽取' : '规则引擎'}
                  {profile.extractedAt &&
                    ` · 更新于 ${formatDate(profile.extractedAt)}`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                画像尚未生成，点击「刷新画像」基于客户信息冷启动分析。
              </p>
            )}
          </section>

          <section className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">AI 下一步建议</h2>
              <button
                onClick={() => generatePlaybookMutation.mutate()}
                disabled={generatePlaybookMutation.isPending}
                className="rounded border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
              >
                {generatePlaybookMutation.isPending ? '生成中…' : '生成建议'}
              </button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              建议可同步到飞书，跟进在飞书完成。
            </p>
            {playbookLoading ? (
              <p className="text-sm text-muted-foreground">加载中…</p>
            ) : playbook ? (
              <div className="space-y-3 text-sm">
                {playbook.generatedBy && (
                  <span className="text-xs text-muted-foreground">
                    {playbook.generatedBy === 'skill' ? 'AI 生成' : '规则引擎'}
                  </span>
                )}
                <p>{playbook.summary}</p>
                {playbook.reasoning && (
                  <p className="text-xs text-muted-foreground">
                    {playbook.reasoning}
                  </p>
                )}
                <ul className="space-y-2">
                  {playbookActions.map((action) => (
                    <li key={action.id} className="rounded border p-3">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-medium">{action.title}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {actionTypeLabels[action.type] ?? action.type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          优先级{' '}
                          {priorityLabels[action.priority] ?? action.priority}
                        </span>
                      </div>
                      <p className="text-muted-foreground">{action.content}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                尚未生成建议。可先刷新画像，再点击「生成建议」。
              </p>
            )}
          </section>

          {(customer.crm?.recentInteractions?.length ?? 0) > 0 && (
            <section className="rounded-lg border p-4">
              <h2 className="font-medium mb-3">平台互动</h2>
              <ul className="space-y-2">
                {customer.crm!.recentInteractions.map((item) => (
                  <li key={item.id} className="rounded border p-2 text-sm">
                    <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {item.type === 'message' ? '私信' : '评论'} ·{' '}
                        {item.status}
                      </span>
                      <span>{formatDate(item.receivedAt)}</span>
                    </div>
                    <p className="mt-1 line-clamp-3">{item.content}</p>
                    {item.conversationId && (
                      <Link
                        href={`/conversations/${item.conversationId}`}
                        className="text-xs text-primary hover:underline mt-1 inline-block"
                      >
                        在会话中查看
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border p-4">
            <h2 className="font-medium mb-3">获客备注</h2>
            <div className="mb-3 flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="添加备注…"
                className="flex-1 rounded border bg-background px-3 py-1.5 text-sm"
              />
              <button
                onClick={() => note.trim() && activityMutation.mutate()}
                disabled={!note.trim() || activityMutation.isPending}
                className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
              >
                添加
              </button>
            </div>
            <ul className="space-y-2">
              {(customer.activities ?? []).map((activity) => (
                <li key={activity.id} className="rounded border p-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{activity.action}</span>
                    <span className="text-muted-foreground text-xs">
                      {formatDate(activity.createdAt)}
                    </span>
                  </div>
                  {activity.note && (
                    <p className="text-muted-foreground mt-1">
                      {activity.note}
                    </p>
                  )}
                </li>
              ))}
              {(customer.activities ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">暂无备注</li>
              )}
            </ul>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">评分</h2>
              {customer.segment && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {segmentLabels[customer.segment] ?? customer.segment}
                </span>
              )}
            </div>
            <ScoreBar label="Fit 匹配度" value={customer.fitScore} />
            <ScoreBar label="Intent 意向" value={customer.intentScore} />
            <ScoreBar label="Health 健康度" value={customer.healthScore} />
          </section>

          <section className="rounded-lg border p-4">
            <h2 className="font-medium mb-3">状态</h2>
            <p className="text-sm mb-3">
              当前：{STATUS_LABELS[customer.status] ?? customer.status}
            </p>
            <div className="flex flex-wrap gap-2">
              {CUSTOMER_STATUSES.map((status) => (
                  <button
                    key={status}
                    onClick={() => statusMutation.mutate(status)}
                    disabled={
                      customer.status === status || statusMutation.isPending
                    }
                    className="rounded border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                  >
                    {STATUS_LABELS[status]}
                  </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border p-4 text-sm text-muted-foreground">
            <p>创建时间：{formatDate(customer.createdAt)}</p>
            <p className="mt-1">更新时间：{formatDate(customer.updatedAt)}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
