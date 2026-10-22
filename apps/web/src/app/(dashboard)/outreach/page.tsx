'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  addOutreachSuppression,
  cancelEnrollment,
  completeOutreachTouch,
  createOutreachSequence,
  deleteOutreachSequence,
  enrollCustomer,
  getOutreachChannelConfig,
  getOutreachWorkbench,
  listDueOutreachTouches,
  listOutreachEnrollments,
  listOutreachSequences,
  listOutreachSuppressions,
  pauseEnrollment,
  removeOutreachSuppression,
  resumeEnrollment,
  scanOutreach,
  updateOutreachChannelConfig,
  type OutreachChannel,
  type OutreachChannelConfig
} from '@/lib/api/outreach';
import { listCustomers } from '@/lib/api/customers';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/utils';

const CHANNEL_LABELS: Record<OutreachChannel, string> = {
  official_dm: '平台私信',
  wecom: '企业微信',
  email: '邮件',
  phone_task: '电话任务',
  manual: '人工记录'
};

const CHANNELS: OutreachChannel[] = [
  'manual',
  'phone_task',
  'wecom',
  'email',
  'official_dm'
];

const STATUS_LABELS: Record<string, string> = {
  verified: '已验证',
  beta: 'Beta',
  unverified: '未验收',
  unsupported: '不支持'
};

type Tab = 'touches' | 'sequences' | 'suppressions' | 'channels';

type SequenceStepDraft = { delayHours: number; template: string };

export default function OutreachPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('touches');
  const [name, setName] = useState('新客三步触达');
  const [channel, setChannel] = useState<OutreachChannel>('manual');
  const [steps, setSteps] = useState<SequenceStepDraft[]>([
    { delayHours: 0, template: '{{name}}，你好，看到你对{{intent}}感兴趣。' },
    { delayHours: 24, template: '{{name}}，补充一份{{company}}可以参考的资料。' }
  ]);
  const [suppressionType, setSuppressionType] = useState<
    'customer' | 'email' | 'phone'
  >('customer');
  const [suppressionValue, setSuppressionValue] = useState('');
  const [suppressionReason, setSuppressionReason] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSequenceId, setSelectedSequenceId] = useState('');

  const workbench = useQuery({
    queryKey: ['outreach', 'workbench'],
    queryFn: getOutreachWorkbench,
    refetchInterval: 30_000
  });
  const touches = useQuery({
    queryKey: ['outreach', 'touches'],
    queryFn: listDueOutreachTouches
  });
  const sequences = useQuery({
    queryKey: ['outreach', 'sequences'],
    queryFn: listOutreachSequences
  });
  const suppressions = useQuery({
    queryKey: ['outreach', 'suppressions'],
    queryFn: listOutreachSuppressions
  });
  const channels = useQuery({
    queryKey: ['outreach', 'channels'],
    queryFn: getOutreachChannelConfig
  });
  const customers = useQuery({
    queryKey: ['customers', 'outreach-picker'],
    queryFn: () => listCustomers({ pageSize: 100 })
  });
  const enrollments = useQuery({
    queryKey: ['outreach', 'enrollments'],
    queryFn: () => listOutreachEnrollments({ status: 'active' })
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['outreach'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['analytics', 'funnel'] });
  };

  const completeMutation = useMutation({
    mutationFn: ({
      id,
      status
    }: {
      id: string;
      status: 'sent' | 'skipped' | 'replied';
    }) => completeOutreachTouch(id, { status }),
    onSuccess: () => {
      toast.success('触达状态已更新');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '更新失败')
  });

  const createSequenceMutation = useMutation({
    mutationFn: () =>
      createOutreachSequence({
        name: name.trim(),
        channel,
        steps: steps.map((step, index) => ({
          order: index + 1,
          delayHours: Number(step.delayHours) || 0,
          template: step.template.trim()
        }))
      }),
    onSuccess: () => {
      toast.success('序列已创建');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '创建失败')
  });

  const deleteSequenceMutation = useMutation({
    mutationFn: (id: string) => deleteOutreachSequence(id),
    onSuccess: () => {
      toast.success('序列已删除');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '删除失败')
  });

  const enrollMutation = useMutation({
    mutationFn: () =>
      enrollCustomer({
        sequenceId: selectedSequenceId,
        customerId: selectedCustomerId
      }),
    onSuccess: (result) => {
      toast.success(result.created ? '已加入触达序列' : '该客户已在序列中');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '加入失败')
  });

  const enrollmentMutation = useMutation({
    mutationFn: ({
      id,
      action
    }: {
      id: string;
      action: 'pause' | 'resume' | 'cancel';
    }) =>
      action === 'pause'
        ? pauseEnrollment(id)
        : action === 'resume'
          ? resumeEnrollment(id)
          : cancelEnrollment(id, '手动取消'),
    onSuccess: () => {
      toast.success('触达报名已更新');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '更新失败')
  });

  const suppressionMutation = useMutation({
    mutationFn: () =>
      addOutreachSuppression({
        type: suppressionType,
        value: suppressionValue.trim(),
        reason: suppressionReason.trim() || undefined
      }),
    onSuccess: () => {
      toast.success('已加入退订/黑名单');
      setSuppressionValue('');
      setSuppressionReason('');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '添加失败')
  });

  const removeSuppressionMutation = useMutation({
    mutationFn: (id: string) => removeOutreachSuppression(id),
    onSuccess: () => {
      toast.success('已移除');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '移除失败')
  });

  const channelMutation = useMutation({
    mutationFn: (patch: OutreachChannelConfig) =>
      updateOutreachChannelConfig({ ...(channels.data ?? {}), ...patch }),
    onSuccess: () => {
      toast.success('渠道能力已更新');
      qc.invalidateQueries({ queryKey: ['outreach', 'channels'] });
    },
    onError: (error: Error) => toast.error(error.message || '保存失败')
  });

  const scanMutation = useMutation({
    mutationFn: scanOutreach,
    onSuccess: (result) => {
      toast.success(`扫描完成：${result.markedDue} 条待触达，${result.escalated} 条升级`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '扫描失败')
  });

  if (workbench.isLoading) return <LoadingState />;
  if (workbench.isError) {
    return <ErrorState onRetry={() => workbench.refetch()} />;
  }

  const dueTouches = touches.data?.items ?? [];
  const sequenceItems = sequences.data?.items ?? [];
  const suppressionItems = suppressions.data?.items ?? [];
  const customerItems = customers.data?.items ?? [];
  const activeEnrollments = enrollments.data?.items ?? [];

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="触达运营"
        description="多步触达序列、退订名单与跟进 SLA；发送保持人工确认"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => scanMutation.mutate()}
            loading={scanMutation.isPending}
          >
            立即扫描
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="今日待触达" value={workbench.data?.due ?? 0} />
        <Kpi label="今日已触达" value={workbench.data?.sentToday ?? 0} />
        <Kpi label="今日已回复" value={workbench.data?.repliedToday ?? 0} />
        <Kpi label="进行中序列" value={workbench.data?.activeEnrollments ?? 0} />
        <Kpi label="退订/黑名单" value={workbench.data?.suppressions ?? 0} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ['touches', '待触达'],
            ['sequences', '序列模板'],
            ['suppressions', '退订名单'],
            ['channels', '渠道能力']
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              tab === key ? 'bg-primary text-primary-foreground' : 'bg-card'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'touches' && (
        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">加入触达</h3>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-sm">
                客户
                <NativeSelect
                  value={selectedCustomerId}
                  onChange={(event) => setSelectedCustomerId(event.target.value)}
                  className="mt-1 block min-w-[200px] rounded border bg-background px-2 py-1.5"
                >
                  <option value="">选择客户</option>
                  {customerItems.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.displayName} · {customer.company}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="text-sm">
                序列
                <NativeSelect
                  value={selectedSequenceId}
                  onChange={(event) => setSelectedSequenceId(event.target.value)}
                  className="mt-1 block min-w-[200px] rounded border bg-background px-2 py-1.5"
                >
                  <option value="">选择序列</option>
                  {sequenceItems.map((sequence) => (
                    <option key={sequence.id} value={sequence.id}>
                      {sequence.name}（{CHANNEL_LABELS[sequence.channel]}）
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <Button
                size="sm"
                disabled={
                  !selectedCustomerId ||
                  !selectedSequenceId ||
                  enrollMutation.isPending
                }
                loading={enrollMutation.isPending}
                onClick={() => enrollMutation.mutate()}
              >
                加入序列
              </Button>
            </div>
          </section>

          {dueTouches.length === 0 ? (
            <EmptyState
              title="没有待触达记录"
              description="把客户加入序列后，到期触达会出现在这里。"
            />
          ) : (
            <section className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="p-3">客户</th>
                    <th className="p-3">序列 / 步骤</th>
                    <th className="p-3">渠道</th>
                    <th className="p-3">计划时间</th>
                    <th className="p-3">内容</th>
                    <th className="p-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {dueTouches.map((touch) => (
                    <tr key={touch.id} className="border-b last:border-0">
                      <td className="p-3">
                        <Link
                          href={`/customers/${touch.enrollment.customer.id}`}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {touch.enrollment.customer.displayName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {touch.enrollment.customer.phone || '电话待补充'}
                        </p>
                      </td>
                      <td className="p-3">
                        <p>{touch.enrollment.sequence.name}</p>
                        <p className="text-xs text-muted-foreground">
                          第 {touch.step?.order ?? 1} 步
                        </p>
                      </td>
                      <td className="p-3">
                        {CHANNEL_LABELS[touch.channel]}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {formatDateTime(touch.scheduledAt)}
                      </td>
                      <td className="max-w-[260px] p-3 text-xs text-muted-foreground">
                        <p className="line-clamp-3">{touch.content}</p>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            size="xs"
                            onClick={() =>
                              completeMutation.mutate({
                                id: touch.id,
                                status: 'sent'
                              })
                            }
                            disabled={completeMutation.isPending}
                          >
                            完成
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() =>
                              completeMutation.mutate({
                                id: touch.id,
                                status: 'replied'
                              })
                            }
                            disabled={completeMutation.isPending}
                          >
                            已回复
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() =>
                              completeMutation.mutate({
                                id: touch.id,
                                status: 'skipped'
                              })
                            }
                            disabled={completeMutation.isPending}
                          >
                            跳过
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">进行中的报名</h3>
            {activeEnrollments.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                暂无进行中的触达报名。
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {activeEnrollments.map((enrollment) => (
                  <li
                    key={enrollment.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"
                  >
                    <div>
                      <Link
                        href={`/customers/${enrollment.customer.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {enrollment.customer.displayName}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {enrollment.sequence.name}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          enrollmentMutation.mutate({
                            id: enrollment.id,
                            action: 'pause'
                          })
                        }
                      >
                        暂停
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          enrollmentMutation.mutate({
                            id: enrollment.id,
                            action: 'cancel'
                          })
                        }
                      >
                        取消
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'sequences' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">新建序列</h3>
            <div className="mt-3 space-y-3">
              <label className="block text-sm">
                名称
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5"
                />
              </label>
              <label className="block text-sm">
                渠道
                <NativeSelect
                  value={channel}
                  onChange={(event) =>
                    setChannel(event.target.value as OutreachChannel)
                  }
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5"
                >
                  {CHANNELS.map((item) => (
                    <option key={item} value={item}>
                      {CHANNEL_LABELS[item]}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              {steps.map((step, index) => (
                <div key={index} className="rounded border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      第 {index + 1} 步
                    </span>
                    {steps.length > 1 && (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          setSteps(steps.filter((_, i) => i !== index))
                        }
                      >
                        删除
                      </Button>
                    )}
                  </div>
                  <label className="mt-2 block text-sm">
                    延迟小时
                    <input
                      type="number"
                      min={0}
                      value={step.delayHours}
                      onChange={(event) =>
                        setSteps(
                          steps.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  delayHours: Number(event.target.value)
                                }
                              : item
                          )
                        )
                      }
                      className="mt-1 w-32 rounded border bg-background px-2 py-1.5"
                    />
                  </label>
                  <label className="mt-2 block text-sm">
                    内容（支持 {'{{name}}'} / {'{{company}}'} / {'{{intent}}'}）
                    <textarea
                      rows={2}
                      value={step.template}
                      onChange={(event) =>
                        setSteps(
                          steps.map((item, i) =>
                            i === index
                              ? { ...item, template: event.target.value }
                              : item
                          )
                        )
                      }
                      className="mt-1 w-full rounded border bg-background px-2 py-1.5"
                    />
                  </label>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setSteps([...steps, { delayHours: 72, template: '' }])
                }
              >
                添加一步
              </Button>
              <Button
                size="sm"
                disabled={
                  !name.trim() ||
                  steps.some((step) => !step.template.trim()) ||
                  createSequenceMutation.isPending
                }
                loading={createSequenceMutation.isPending}
                onClick={() => createSequenceMutation.mutate()}
              >
                创建序列
              </Button>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">已有序列</h3>
            {sequenceItems.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                还没有触达序列。
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {sequenceItems.map((sequence) => (
                  <li key={sequence.id} className="rounded border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{sequence.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {CHANNEL_LABELS[sequence.channel]} ·{' '}
                          {sequence.steps.length} 步
                        </p>
                      </div>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          deleteSequenceMutation.mutate(sequence.id)
                        }
                        disabled={deleteSequenceMutation.isPending}
                      >
                        删除
                      </Button>
                    </div>
                    <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {sequence.steps.map((step) => (
                        <li key={step.id}>
                          第 {step.order} 步 · +{step.delayHours}h ·{' '}
                          {step.template.slice(0, 40)}
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'suppressions' && (
        <section className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">退订 / 黑名单</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            命中退订的客户不会收到任何触达；跳过操作仍可记录。
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              类型
              <NativeSelect
                value={suppressionType}
                onChange={(event) =>
                  setSuppressionType(
                    event.target.value as 'customer' | 'email' | 'phone'
                  )
                }
                className="mt-1 block rounded border bg-background px-2 py-1.5"
              >
                <option value="customer">客户 ID</option>
                <option value="email">邮箱</option>
                <option value="phone">手机号</option>
              </NativeSelect>
            </label>
            <label className="text-sm">
              值
              <input
                value={suppressionValue}
                onChange={(event) => setSuppressionValue(event.target.value)}
                className="mt-1 block min-w-[220px] rounded border bg-background px-2 py-1.5"
              />
            </label>
            <label className="text-sm">
              原因
              <input
                value={suppressionReason}
                onChange={(event) => setSuppressionReason(event.target.value)}
                className="mt-1 block min-w-[180px] rounded border bg-background px-2 py-1.5"
              />
            </label>
            <Button
              size="sm"
              disabled={!suppressionValue.trim() || suppressionMutation.isPending}
              loading={suppressionMutation.isPending}
              onClick={() => suppressionMutation.mutate()}
            >
              添加
            </Button>
          </div>

          {suppressionItems.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              暂无退订/黑名单记录。
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {suppressionItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"
                >
                  <div>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {item.type}
                    </span>
                    <span className="ml-2">{item.value}</span>
                    {item.reason ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {item.reason}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => removeSuppressionMutation.mutate(item.id)}
                  >
                    移除
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'channels' && (
        <section className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">渠道能力</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            只有“已验证”渠道允许发送；Beta/未验收渠道只能生成人工任务。
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {CHANNELS.map((item) => {
              const current =
                channels.data?.[item] ??
                (item === 'manual' || item === 'phone_task'
                  ? 'verified'
                  : 'unverified');
              return (
                <div key={item} className="rounded border p-3">
                  <p className="text-sm font-medium">{CHANNEL_LABELS[item]}</p>
                  <NativeSelect
                    value={current}
                    onChange={(event) =>
                      channelMutation.mutate({
                        [item]: event.target.value as
                          | 'verified'
                          | 'beta'
                          | 'unverified'
                          | 'unsupported'
                      })
                    }
                    disabled={channelMutation.isPending}
                    className="mt-2 w-full rounded border bg-background px-2 py-1.5 text-sm"
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
