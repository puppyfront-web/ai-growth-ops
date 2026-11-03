'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { ApiError } from '@/lib/api/client';
import {
  convertProspectToCustomer,
  type ProspectCandidate
} from '@/lib/api/prospecting';
import type { CustomerDuplicate } from '@/types/customer';
import { candidateComments, ProfileSummary } from './prospect-shared';
import { Button } from '@/components/ui/button';

/** 潜客转客户弹窗：含 409 重复客户确认流。 */
export function ConvertDialog({
  candidate,
  onClose,
  onDone
}: {
  candidate: ProspectCandidate;
  onClose: () => void;
  onDone: (result: { reused: boolean; customerId: string }) => void;
}) {
  const comments = candidateComments(candidate);
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState(candidate.userNickname ?? '');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [intent, setIntent] = useState(
    candidate.summary || candidate.content.slice(0, 200)
  );
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [duplicates, setDuplicates] = useState<CustomerDuplicate[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: () =>
      convertProspectToCustomer(candidate.id, {
        phone: phone.trim() || undefined,
        displayName,
        company: company || undefined,
        role: role || undefined,
        intent,
        confirmDuplicate
      }),
    onSuccess: (result) =>
      onDone({ reused: result.reused, customerId: result.customer.id }),
    onError: (err: Error) => {
      if (err instanceof ApiError && err.status === 409) {
        const items = Array.isArray(err.payload.duplicates)
          ? (err.payload.duplicates as CustomerDuplicate[])
          : [];
        setDuplicates(items);
        setConfirmDuplicate(true);
        setError('手机号已存在，确认仍要新建？');
        return;
      }
      setError(err.message);
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="convert-prospect-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border bg-background p-5 shadow-lg space-y-3"
      >
        <h3 id="convert-prospect-title" className="font-medium">
          转入客户库
        </h3>
        <p className="text-xs text-muted-foreground">
          平台拿不到手机号，可直接转入；跟进请到飞书完成。
        </p>
        <p className="text-sm font-medium">
          {candidate.userNickname ?? '未知用户'}
        </p>
        {candidate.metadata?.profile && (
          <ProfileSummary profile={candidate.metadata.profile} />
        )}
        <div className="space-y-1.5 rounded-md border p-2">
          <p className="text-xs text-muted-foreground">
            已采集评论 {comments.length} 条
          </p>
          {comments.map((item, index) => (
            <p key={`${item.content}-${index}`} className="text-xs">
              {index === 0 && (
                <span className="mr-1 rounded bg-primary/10 px-1 text-primary">
                  优先
                </span>
              )}
              {item.content}
            </p>
          ))}
        </div>
        <label htmlFor="prospect-name" className="sr-only">
          姓名
        </label>
        <input
          id="prospect-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="姓名"
          className="w-full rounded border px-2 py-1.5 text-sm"
        />
        <label htmlFor="prospect-phone" className="sr-only">
          手机号（选填）
        </label>
        <input
          id="prospect-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="手机号（选填，后续人工补充）"
          className="w-full rounded border px-2 py-1.5 text-sm"
        />
        <label htmlFor="prospect-company" className="sr-only">
          公司
        </label>
        <input
          id="prospect-company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="公司（选填）"
          className="w-full rounded border px-2 py-1.5 text-sm"
        />
        <label htmlFor="prospect-role" className="sr-only">
          职位
        </label>
        <input
          id="prospect-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="职位（选填）"
          className="w-full rounded border px-2 py-1.5 text-sm"
        />
        <label htmlFor="prospect-intent" className="sr-only">
          需求
        </label>
        <textarea
          id="prospect-intent"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          rows={2}
          placeholder="需求"
          className="w-full rounded border px-2 py-1.5 text-sm"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {duplicates.length > 0 && (
          <ul className="space-y-2 rounded-md border border-warning/25 bg-warning/10 p-3 text-sm">
            {duplicates.map((item) => (
              <li key={item.id}>
                <div className="font-medium">
                  {item.displayName} · {item.phone || '待补充'}
                </div>
                <div className="text-muted-foreground">
                  {item.company} · {item.role}
                </div>
                <Link
                  href={`/customers/${item.id}`}
                  className="text-xs text-primary hover:underline"
                >
                  查看已有客户
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {confirmDuplicate ? '仍要新建' : '确认转入'}
          </Button>
        </div>
      </div>
    </div>
  );
}
