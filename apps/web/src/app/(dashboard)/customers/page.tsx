'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  listCustomers,
  listCustomerFollowUps,
  createCustomer,
  updateCustomer,
  checkCustomerDuplicate
} from '@/lib/api/customers';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { DataTable } from '@/components/shared/DataTable';
import { LoadingState } from '@/components/shared/LoadingState';
import { formatDate, formatDateTime } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  Customer,
  CustomerDuplicate,
  CustomerStatus
} from '@/types/customer';
import { CustomerDuplicateError } from '@/types/customer';
import {
  AlertDialog,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from '@/components/ui/alert-dialog';
import { CustomerImportPanel } from '@/components/customers/CustomerImportPanel';
import { useOrgMembers } from '@/hooks/use-org-members';
import {
  CHANNEL_LABELS,
  CUSTOMER_STATUSES,
  CustomerEditor,
  STATUS_LABELS,
  emptyCustomerForm,
  formFromCustomer,
  isUnfilled,
  type CustomerFormValues
} from '@/components/customers/CustomerEditor';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';

function DuplicateList({ items }: { items: CustomerDuplicate[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {items.map((item) => (
        <li key={item.id} className="rounded-md border p-2">
          <div className="font-medium">
            {item.displayName} · {item.phone || '待补充'}
          </div>
          <div className="text-muted-foreground">
            {item.company} · {item.role}
          </div>
          <div className="text-muted-foreground line-clamp-1">
            {item.intent}
          </div>
          <Link
            href={`/customers/${item.id}`}
            className="text-primary text-xs hover:underline"
          >
            查看已有客户
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Unfilled({ text = '待补充' }: { text?: string }) {
  return <span className="text-xs text-warning">{text}</span>;
}

export default function CustomersPage() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<{
    q?: string;
    channel?: string;
    source?: string;
    status?: string;
    pending?: string;
  }>({
    q: searchParams.get('q') || undefined,
    channel: searchParams.get('channel') || undefined,
    source: searchParams.get('source') || undefined,
    status: searchParams.get('status') || undefined,
    pending: searchParams.get('pending') || undefined
  });
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerFormValues>(emptyCustomerForm());
  const [duplicateHint, setDuplicateHint] = useState<CustomerDuplicate[]>([]);
  const [duplicateDialog, setDuplicateDialog] = useState<{
    open: boolean;
    duplicates: CustomerDuplicate[];
    normalizedPhone: string;
  }>({ open: false, duplicates: [], normalizedPhone: '' });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['customers', filters, page],
    queryFn: () => listCustomers({ ...filters, page })
  });
  const { data: followUps } = useQuery({
    queryKey: ['customers', 'follow-ups'],
    queryFn: listCustomerFollowUps
  });
  const { data: teamMembers = [] } = useOrgMembers();

  const resetForm = () => {
    setForm(emptyCustomerForm());
    setDuplicateHint([]);
    setShowCreate(false);
    setEditingId(null);
  };

  const startEdit = (customer: Customer) => {
    setShowCreate(false);
    setEditingId(customer.id);
    setForm(formFromCustomer(customer));
    setDuplicateHint([]);
  };

  const createMutation = useMutation({
    mutationFn: (confirmDuplicate?: boolean) =>
      createCustomer({
        displayName: form.displayName,
        phone: form.phone,
        company: form.company,
        role: form.role,
        intent: form.intent,
        channel: form.channel,
        sourceNote: form.sourceNote,
        assignedTo: form.assignedTo || undefined,
        confirmDuplicate
      }),
    onSuccess: () => {
      resetForm();
      setDuplicateDialog({ open: false, duplicates: [], normalizedPhone: '' });
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err: Error) => {
      if (err instanceof CustomerDuplicateError) {
        setDuplicateDialog({
          open: true,
          duplicates: err.duplicates,
          normalizedPhone: err.normalizedPhone
        });
      }
    }
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('未选择客户');
      return updateCustomer(editingId, {
        displayName: form.displayName.trim(),
        phone: form.phone.trim(),
        company: form.company.trim(),
        role: form.role.trim(),
        intent: form.intent.trim(),
        channel: form.channel,
        sourceNote: form.sourceNote,
        status: form.status,
        assignedTo: form.assignedTo || undefined,
        nextAction: form.nextAction.trim() || null,
        nextActionAt: form.nextActionAt
          ? new Date(form.nextActionAt).toISOString()
          : null
      });
    },
    onSuccess: () => {
      resetForm();
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['deals-pipeline'] });
      qc.invalidateQueries({ queryKey: ['analytics', 'funnel'] });
    }
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CustomerStatus }) =>
      updateCustomer(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] })
  });

  const handlePhoneBlur = async () => {
    const phone = form.phone.trim();
    if (!phone) {
      setDuplicateHint([]);
      return;
    }
    try {
      const result = await checkCustomerDuplicate(phone);
      setDuplicateHint(
        result.duplicates.filter((item) => item.id !== editingId)
      );
    } catch {
      setDuplicateHint([]);
    }
  };

  const canCreate =
    form.displayName.trim() &&
    form.phone.trim() &&
    form.company.trim() &&
    form.role.trim() &&
    form.intent.trim();
  const canUpdate = form.displayName.trim() && form.intent.trim();

  const columns = useMemo<ColumnDef<Customer>[]>(
    () => [
      {
        accessorKey: 'displayName',
        header: '客户',
        cell: ({ row }) => (
          <div>
            <Link
              href={`/customers/${row.original.id}`}
              className="font-medium text-sm hover:underline"
            >
              {row.original.displayName}
            </Link>
            <p className="text-xs text-muted-foreground">
              {isUnfilled(row.original.company) ? (
                <Unfilled />
              ) : (
                row.original.company
              )}
            </p>
          </div>
        )
      },
      {
        accessorKey: 'phone',
        header: '手机号',
        cell: ({ row }) => {
          const tags = Array.isArray(row.original.tags)
            ? (row.original.tags as string[])
            : [];
          if (isUnfilled(row.original.phone)) {
            return (
              <Unfilled
                text={tags.includes('待跟进') ? '待补充 · 待跟进' : '待补充'}
              />
            );
          }
          return row.original.phone;
        }
      },
      {
        accessorKey: 'role',
        header: '职位',
        cell: ({ row }) =>
          isUnfilled(row.original.role) ? <Unfilled /> : row.original.role
      },
      {
        accessorKey: 'intent',
        header: '需求',
        cell: ({ getValue }) => {
          const intent = (getValue() as string) || '';
          if (isUnfilled(intent)) return <Unfilled />;
          return (
            <span className="text-sm text-muted-foreground line-clamp-1 max-w-xs">
              {intent}
            </span>
          );
        }
      },
      {
        accessorKey: 'channel',
        header: '来源',
        cell: ({ row }) => (
          <span className="text-sm">
            {CHANNEL_LABELS[row.original.channel] ?? row.original.channel}
          </span>
        )
      },
      {
        accessorKey: 'intentScore',
        header: '意向',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.intentScore}
          </span>
        )
      },
      {
        accessorKey: 'segment',
        header: '分段',
        cell: ({ getValue }) => {
          const seg = getValue() as string | null;
          const labels: Record<string, string> = {
            hot: '高意向',
            warm: '可培育',
            cold: '低活跃',
            at_risk: '风险'
          };
          return (
            <span className="text-sm">{seg ? (labels[seg] ?? seg) : '-'}</span>
          );
        }
      },
      {
        accessorKey: 'status',
        header: '状态',
        cell: ({ row }) => {
          const tags = Array.isArray(row.original.tags)
            ? (row.original.tags as string[])
            : [];
          return (
            <div className="flex items-center gap-1 flex-wrap">
              <NativeSelect
                aria-label={`${row.original.displayName} 跟进状态`}
                value={row.original.status}
                disabled={statusMutation.isPending}
                onChange={(e) =>
                  statusMutation.mutate({
                    id: row.original.id,
                    status: e.target.value as CustomerStatus
                  })
                }
                className="rounded border bg-background px-1.5 py-1 text-xs"
              >
                {CUSTOMER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </NativeSelect>
              {tags.includes('待跟进') && (
                <span className="rounded-full bg-warning/10 px-1.5 py-0.5 text-xs text-warning">
                  待跟进
                </span>
              )}
              {tags.includes('获客转入') && (
                <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-xs text-success">
                  获客转入
                </span>
              )}
            </div>
          );
        }
      },
      {
        accessorKey: 'createdAt',
        header: '创建时间',
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">
            {formatDateTime(getValue() as string)}
          </span>
        )
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => startEdit(row.original)}
            className="text-primary hover:text-primary hover:underline"
          >
            编辑
          </Button>
        )
      }
    ],
    [statusMutation.isPending]
  );

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="客户管理"
        description="获客与评论私信汇入客户库，跟进在飞书完成"
        actions={
          <div className="flex items-center gap-2">
            <CustomerImportPanel />
            <Button
              onClick={() => {
                setEditingId(null);
                setForm(emptyCustomerForm());
                setShowCreate((v) => !v);
              }}
            >
              + 新建客户
            </Button>
          </div>
        }
      />

      {(showCreate || editingId) && (
        <div className="mb-4 rounded-lg border bg-muted/30 p-4 space-y-3">
          <h2 className="text-sm font-medium">
            {editingId ? '编辑客户资料' : '新建客户'}
          </h2>
          <CustomerEditor
            value={form}
            onChange={setForm}
            showStatus={Boolean(editingId)}
            showAssignee
            assigneeOptions={teamMembers.map((m) => ({
              id: m.id,
              name: m.name
            }))}
            idPrefix={editingId ? 'edit-customer' : 'new-customer'}
            onPhoneBlur={handlePhoneBlur}
          />

          {duplicateHint.length > 0 && (
            <div className="rounded-md border border-warning/25 bg-warning/10 p-3">
              <p className="text-sm text-warning">
                检测到 {duplicateHint.length} 条相同手机号的客户记录：
              </p>
              <DuplicateList items={duplicateHint} />
            </div>
          )}

          <div className="flex gap-2">
            {editingId ? (
              <Button
                onClick={() => canUpdate && updateMutation.mutate()}
                disabled={!canUpdate}
                loading={updateMutation.isPending}
              >
                {updateMutation.isPending ? '保存中…' : '保存修改'}
              </Button>
            ) : (
              <Button
                onClick={() => canCreate && createMutation.mutate(undefined)}
                disabled={!canCreate}
                loading={createMutation.isPending}
              >
                {createMutation.isPending ? '保存中…' : '保存客户'}
              </Button>
            )}
            <Button variant="outline" onClick={resetForm}>
              取消
            </Button>
          </div>
          {createMutation.isError &&
            !(createMutation.error instanceof CustomerDuplicateError) && (
              <p className="text-sm text-destructive">
                {(createMutation.error as Error).message}
              </p>
            )}
          {updateMutation.isError && (
            <p className="text-sm text-destructive">
              {(updateMutation.error as Error).message}
            </p>
          )}
        </div>
      )}

      {(followUps?.items.length ?? 0) > 0 && (
        <div className="mb-4 rounded-lg border p-3 space-y-2">
          <p className="text-sm font-medium">AI 建议</p>
          {followUps?.items.slice(0, 5).map((item) => (
            <div
              key={`${item.playbookId}-${item.actionId}`}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <Link
                href={`/customers/${item.customerId}`}
                className="text-primary hover:underline truncate"
              >
                {item.displayName} · {item.title}
              </Link>
              <span
                className={`text-xs flex-shrink-0 ${
                  item.overdue ? 'text-destructive' : 'text-muted-foreground'
                }`}
              >
                {item.overdue ? '逾期' : '截止'} {formatDate(item.dueAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={filters.q ?? ''}
          onChange={(e) => {
            setPage(1);
            setFilters((f) => ({ ...f, q: e.target.value }));
          }}
          placeholder="搜索姓名、公司、手机号、需求…"
          className="w-64 rounded border bg-background px-3 py-1.5 text-sm"
        />
        <NativeSelect
          value={filters.channel ?? ''}
          onChange={(e) => {
            setPage(1);
            setFilters((f) => ({
              ...f,
              channel: e.target.value || undefined
            }));
          }}
          className="rounded border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">全部来源</option>
          {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={filters.source ?? ''}
          onChange={(e) => {
            setPage(1);
            setFilters((f) => ({
              ...f,
              source: e.target.value || undefined
            }));
          }}
          className="rounded border bg-background px-3 py-1.5 text-sm"
          aria-label="客户来源类型"
        >
          <option value="">全部客户</option>
          <option value="prospecting">获客转入</option>
        </NativeSelect>
        <NativeSelect
          value={filters.pending ?? ''}
          onChange={(e) => {
            setPage(1);
            setFilters((f) => ({
              ...f,
              pending: e.target.value || undefined
            }));
          }}
          className="rounded border bg-background px-3 py-1.5 text-sm"
          aria-label="待办筛选"
        >
          <option value="">全部待办</option>
          <option value="contact">待补联系方式</option>
        </NativeSelect>
        <NativeSelect
          value={filters.status ?? ''}
          onChange={(e) => {
            setPage(1);
            setFilters((f) => ({
              ...f,
              status: e.target.value || undefined
            }));
          }}
          className="rounded border bg-background px-3 py-1.5 text-sm"
          aria-label="跟进状态"
        >
          <option value="">全部状态</option>
          {CUSTOMER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </NativeSelect>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <div className="text-sm text-destructive">
          加载失败，请重试。
          <Button
            variant="ghost"
            size="xs"
            onClick={() => refetch()}
            className="ml-2 underline"
          >
            刷新
          </Button>
        </div>
      ) : (
        <>
          <DataTable columns={columns} data={data?.items ?? []} />
          {(data?.totalPages ?? 0) > 1 && (
            <div className="mt-4 flex items-center justify-end gap-3 text-sm">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1}
              >
                上一页
              </Button>
              <span>
                第 {page} / {data?.totalPages} 页
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((value) => value + 1)}
                disabled={page >= (data?.totalPages ?? 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      )}

      <AlertDialog
        open={duplicateDialog.open}
        onOpenChange={(open) =>
          !open &&
          setDuplicateDialog({
            open: false,
            duplicates: [],
            normalizedPhone: ''
          })
        }
      >
        <AlertDialogHeader>
          <AlertDialogTitle>发现重复客户</AlertDialogTitle>
          <AlertDialogDescription>
            手机号 {duplicateDialog.normalizedPhone || form.phone}{' '}
            已存在于以下客户记录中。是否仍要新建一条客户？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <DuplicateList items={duplicateDialog.duplicates} />
        <AlertDialogFooter>
          <AlertDialogCancel>取消，去查看已有客户</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => createMutation.mutate(true)}
            disabled={createMutation.isPending}
          >
            仍要新建
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialog>
    </div>
  );
}
