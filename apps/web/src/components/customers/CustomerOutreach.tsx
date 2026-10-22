'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelEnrollment,
  enrollCustomer,
  listOutreachEnrollments,
  listOutreachSequences,
  pauseEnrollment,
  resumeEnrollment,
  type OutreachChannel
} from '@/lib/api/outreach';
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

const STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  paused: '已暂停',
  completed: '已完成',
  cancelled: '已取消'
};

export function CustomerOutreach({ customerId }: { customerId: string }) {
  const qc = useQueryClient();
  const [sequenceId, setSequenceId] = useState('');

  const sequences = useQuery({
    queryKey: ['outreach', 'sequences'],
    queryFn: listOutreachSequences
  });
  const enrollments = useQuery({
    queryKey: ['outreach', 'enrollments', customerId],
    queryFn: () => listOutreachEnrollments({ customerId })
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['outreach'] });
  };

  const enrollMutation = useMutation({
    mutationFn: () =>
      enrollCustomer({ sequenceId, customerId }),
    onSuccess: (result) => {
      toast.success(result.created ? '已加入触达序列' : '该客户已在序列中');
      setSequenceId('');
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
          : cancelEnrollment(id, '客户详情手动取消'),
    onSuccess: () => {
      toast.success('触达状态已更新');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '更新失败')
  });

  const items = enrollments.data?.items ?? [];
  const sequenceItems = sequences.data?.items ?? [];
  const active = items.filter((item) => item.status === 'active');

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">触达序列</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            按步骤跟进；退订、频控和静默期在发送时校验。
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <NativeSelect
          value={sequenceId}
          onChange={(event) => setSequenceId(event.target.value)}
          className="min-w-[220px] rounded border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">选择触达序列</option>
          {sequenceItems.map((sequence) => (
            <option key={sequence.id} value={sequence.id}>
              {sequence.name}（{CHANNEL_LABELS[sequence.channel]}）
            </option>
          ))}
        </NativeSelect>
        <Button
          size="sm"
          disabled={!sequenceId || enrollMutation.isPending}
          loading={enrollMutation.isPending}
          onClick={() => enrollMutation.mutate()}
        >
          加入序列
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          该客户还没有触达记录。
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((enrollment) => {
            const nextTouch = enrollment.touches.find(
              (touch) => touch.status === 'planned' || touch.status === 'due'
            );
            return (
              <li key={enrollment.id} className="rounded border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{enrollment.sequence.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {STATUS_LABELS[enrollment.status] ?? enrollment.status}
                      {nextTouch
                        ? ` · 下一步 ${formatDateTime(nextTouch.scheduledAt)}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {enrollment.status === 'active' && (
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
                    )}
                    {enrollment.status === 'paused' && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          enrollmentMutation.mutate({
                            id: enrollment.id,
                            action: 'resume'
                          })
                        }
                      >
                        继续
                      </Button>
                    )}
                    {(enrollment.status === 'active' ||
                      enrollment.status === 'paused') && (
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
                    )}
                  </div>
                </div>
                {nextTouch?.content ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {nextTouch.content}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {active.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          待触达记录在「触达运营」工作台统一处理。
        </p>
      ) : null}
    </section>
  );
}
