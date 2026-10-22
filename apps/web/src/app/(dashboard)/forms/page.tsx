'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  createAssignmentRule,
  createCaptureForm,
  deleteAssignmentRule,
  listAssignmentRules,
  listCaptureForms,
  updateCaptureForm,
  type CaptureField
} from '@/lib/api/forms';
import { useOrgMembers } from '@/hooks/use-org-members';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/utils';

const DEFAULT_FIELDS: CaptureField[] = [
  { key: 'name', label: '姓名', type: 'text', required: true },
  { key: 'phone', label: '手机号', type: 'tel', required: true },
  { key: 'company', label: '公司', type: 'text' },
  { key: 'message', label: '需求', type: 'textarea' }
];

const CHANNEL_OPTIONS = [
  ['website', '官网/表单'],
  ['douyin', '抖音'],
  ['xiaohongshu', '小红书'],
  ['wechat_official', '微信公众号'],
  ['wechat_channels', '视频号'],
  ['manual', '手动']
] as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export default function FormsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'forms' | 'rules'>('forms');
  const [name, setName] = useState('官网咨询');
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('获取专属方案');
  const [description, setDescription] = useState('');
  const [ruleName, setRuleName] = useState('官网表单分配');
  const [ruleChannel, setRuleChannel] = useState('website');
  const [ruleAssignee, setRuleAssignee] = useState('');
  const [rulePriority, setRulePriority] = useState('1');

  const forms = useQuery({
    queryKey: ['capture-forms'],
    queryFn: listCaptureForms
  });
  const rules = useQuery({
    queryKey: ['assignment-rules'],
    queryFn: listAssignmentRules
  });
  const { data: members = [] } = useOrgMembers();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['capture-forms'] });
    qc.invalidateQueries({ queryKey: ['assignment-rules'] });
  };

  const createFormMutation = useMutation({
    mutationFn: () =>
      createCaptureForm({
        name: name.trim(),
        slug: slug.trim() || slugify(name),
        title: title.trim(),
        description: description.trim() || null,
        fields: DEFAULT_FIELDS
      }),
    onSuccess: () => {
      toast.success('表单已创建');
      setSlug('');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '创建失败')
  });

  const toggleFormMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateCaptureForm(id, { enabled }),
    onSuccess: () => {
      toast.success('表单状态已更新');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '更新失败')
  });

  const createRuleMutation = useMutation({
    mutationFn: () =>
      createAssignmentRule({
        name: ruleName.trim(),
        priority: Number(rulePriority) || 100,
        conditions: { channel: ruleChannel },
        assigneeId: ruleAssignee || null,
        strategy: ruleAssignee ? 'fixed' : 'least_loaded'
      }),
    onSuccess: () => {
      toast.success('分配规则已创建');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '创建失败')
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => deleteAssignmentRule(id),
    onSuccess: () => {
      toast.success('规则已删除');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '删除失败')
  });

  if (forms.isLoading) return <LoadingState />;
  if (forms.isError) return <ErrorState onRetry={() => forms.refetch()} />;

  const formItems = forms.data?.items ?? [];
  const ruleItems = rules.data?.items ?? [];

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="表单获客"
        description="公开表单收集线索；提交后自动去重、分配负责人并进入客户库"
      />

      <div className="mb-4 flex gap-2">
        {(
          [
            ['forms', '表单'],
            ['rules', '分配规则']
          ] as Array<['forms' | 'rules', string]>
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

      {tab === 'forms' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">新建表单</h3>
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
                slug（公开链接使用）
                <input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder={slugify(name) || 'contact-form'}
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5"
                />
              </label>
              <label className="block text-sm">
                标题
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5"
                />
              </label>
              <label className="block text-sm">
                说明
                <textarea
                  rows={2}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5"
                />
              </label>
              <p className="text-xs text-muted-foreground">
                默认字段：姓名、手机号、公司、需求。提交后会按手机号去重。
              </p>
              <Button
                size="sm"
                disabled={!name.trim() || !title.trim() || createFormMutation.isPending}
                loading={createFormMutation.isPending}
                onClick={() => createFormMutation.mutate()}
              >
                创建表单
              </Button>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">已有表单</h3>
            {formItems.length === 0 ? (
              <EmptyState
                title="还没有表单"
                description="创建第一个公开表单，把链接投放到官网或内容里。"
              />
            ) : (
              <ul className="mt-3 space-y-2">
                {formItems.map((form) => (
                  <li key={form.id} className="rounded border p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{form.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {form.title} · {form.fields.length} 个字段 ·{' '}
                          {formatDateTime(form.createdAt)}
                        </p>
                      </div>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          toggleFormMutation.mutate({
                            id: form.id,
                            enabled: !form.enabled
                          })
                        }
                      >
                        {form.enabled ? '停用' : '启用'}
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <Link
                        href={`/f/${form.slug}`}
                        target="_blank"
                        className="text-primary hover:underline"
                      >
                        /f/{form.slug}
                      </Link>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          navigator.clipboard
                            ?.writeText(`${window.location.origin}/f/${form.slug}`)
                            .then(() => toast.success('链接已复制'))
                            .catch(() => toast.error('复制失败'));
                        }}
                      >
                        复制链接
                      </button>
                      <span className="text-muted-foreground">
                        {form.enabled ? '已启用' : '已停用'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'rules' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">新建分配规则</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              按渠道匹配；不指定负责人时按当前负载分配给最空闲成员。
            </p>
            <div className="mt-3 space-y-3">
              <label className="block text-sm">
                名称
                <input
                  value={ruleName}
                  onChange={(event) => setRuleName(event.target.value)}
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5"
                />
              </label>
              <label className="block text-sm">
                渠道
                <NativeSelect
                  value={ruleChannel}
                  onChange={(event) => setRuleChannel(event.target.value)}
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5"
                >
                  {CHANNEL_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="block text-sm">
                负责人（留空按负载分配）
                <NativeSelect
                  value={ruleAssignee}
                  onChange={(event) => setRuleAssignee(event.target.value)}
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5"
                >
                  <option value="">按负载分配</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="block text-sm">
                优先级（越小越先）
                <input
                  type="number"
                  min={1}
                  value={rulePriority}
                  onChange={(event) => setRulePriority(event.target.value)}
                  className="mt-1 w-32 rounded border bg-background px-2 py-1.5"
                />
              </label>
              <Button
                size="sm"
                disabled={!ruleName.trim() || createRuleMutation.isPending}
                loading={createRuleMutation.isPending}
                onClick={() => createRuleMutation.mutate()}
              >
                创建规则
              </Button>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">已有规则</h3>
            {ruleItems.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                还没有分配规则，新线索会按负载分配。
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {ruleItems.map((rule) => (
                  <li
                    key={rule.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{rule.name}</p>
                      <p className="text-xs text-muted-foreground">
                        渠道 {rule.conditions.channel ?? '全部'} · 优先级{' '}
                        {rule.priority} ·{' '}
                        {rule.assigneeId
                          ? members.find((member) => member.id === rule.assigneeId)
                              ?.name ?? rule.assigneeId
                          : '按负载分配'}
                      </p>
                    </div>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => deleteRuleMutation.mutate(rule.id)}
                    >
                      删除
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
