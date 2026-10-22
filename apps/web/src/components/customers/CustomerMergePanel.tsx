'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  listCustomerDuplicates,
  mergeCustomer,
  type CustomerDuplicateCandidate
} from '@/lib/api/customers';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { toast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/utils';

export function CustomerMergePanel({ customerId }: { customerId: string }) {
  const qc = useQueryClient();
  const [pending, setPending] =
    useState<CustomerDuplicateCandidate | null>(null);

  const duplicates = useQuery({
    queryKey: ['customers', customerId, 'duplicates'],
    queryFn: () => listCustomerDuplicates(customerId)
  });

  const mergeMutation = useMutation({
    mutationFn: (sourceCustomerId: string) =>
      mergeCustomer(customerId, sourceCustomerId),
    onSuccess: () => {
      toast.success('客户已合并');
      setPending(null);
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customers', customerId] });
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['analytics', 'funnel'] });
    },
    onError: (error: Error) => toast.error(error.message || '合并失败')
  });

  const items = duplicates.data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <section className="rounded-lg border border-warning/30 bg-warning/5 p-4">
      <h2 className="font-medium">疑似重复客户</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        手机号或同名同渠道的客户。合并后线索、商机、触达和表单提交都会迁移到当前客户。
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border bg-card p-3 text-sm"
          >
            <div>
              <Link
                href={`/customers/${item.id}`}
                className="font-medium hover:text-primary hover:underline"
              >
                {item.displayName}
              </Link>
              <p className="text-xs text-muted-foreground">
                {item.phone || '电话待补充'} · {item.company} ·{' '}
                {formatDateTime(item.createdAt)}
              </p>
            </div>
            <Button
              size="xs"
              variant="outline"
              onClick={() => setPending(item)}
            >
              合并到此客户
            </Button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title="确认合并客户"
        description={`将「${pending?.displayName ?? ''}」合并到当前客户？该操作会迁移全部来源关系，原客户将被软删除。`}
        confirmLabel="确认合并"
        variant="destructive"
        onConfirm={() => {
          if (pending) mergeMutation.mutate(pending.id);
        }}
      />
    </section>
  );
}
