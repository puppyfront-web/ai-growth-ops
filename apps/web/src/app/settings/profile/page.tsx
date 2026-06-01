'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card, CardContent } from '@/components/ui/card';

export default function ProfilePage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? '运营人员');
  const [email, setEmail] = useState(user?.email ?? 'operator@example.com');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

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
            <input value="运营" disabled className="mt-1 w-full rounded-md border bg-muted p-2 text-sm" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSave} className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground">保存</button>
            {saved && <span className="text-sm text-emerald-600">已保存</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
