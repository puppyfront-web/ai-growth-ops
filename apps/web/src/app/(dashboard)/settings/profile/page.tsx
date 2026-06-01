'use client';

import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { getProfile, updateProfile } from '@/lib/api/settings';
import { useAuth } from '@/providers/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';

const roleLabels: Record<string, string> = { admin: '管理员', operator: '运营', viewer: '只读' };

export default function ProfilePage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState(user?.role ?? 'operator');
  const [isLoading, setIsLoading] = useState(!user);

  useEffect(() => {
    if (!user) {
      getProfile()
        .then((p) => { setName(p.name); setEmail(p.email); setRole(p.role); })
        .catch(() => {})
        .finally(() => setIsLoading(false));
    }
  }, [user]);

  const saveMutation = useMutation({
    mutationFn: () => updateProfile({ name, email }),
    onSuccess: () => toast.success('个人设置已保存'),
    onError: () => toast.error('保存失败，请重试'),
  });

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="个人设置" />

      <Card className="max-w-lg">
        <CardContent className="space-y-4 pt-6">
          <div>
            <label className="text-sm font-medium">姓名</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border p-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">邮箱</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-md border p-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">角色</label>
            <input value={roleLabels[role] ?? role} disabled className="mt-1 w-full rounded-md border bg-muted p-2 text-sm" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground disabled:opacity-50">
              {saveMutation.isPending ? '保存中...' : '保存'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
