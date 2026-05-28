import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function ProfilePage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader title="个人设置" />
      <div className="max-w-lg rounded-xl border bg-card p-5 space-y-4">
        <div><label className="text-sm font-medium">姓名</label><input defaultValue="运营人员" className="mt-1 w-full rounded-md border p-2 text-sm" /></div>
        <div><label className="text-sm font-medium">邮箱</label><input defaultValue="operator@example.com" className="mt-1 w-full rounded-md border p-2 text-sm" /></div>
        <div><label className="text-sm font-medium">角色</label><input defaultValue="运营" disabled className="mt-1 w-full rounded-md border bg-muted p-2 text-sm" /></div>
        <button className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground">保存</button>
      </div>
    </div>
  );
}
