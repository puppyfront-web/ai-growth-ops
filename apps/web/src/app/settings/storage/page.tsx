import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function StoragePage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader title="存储配置" description="配置素材存储方式" />
      <div className="max-w-lg rounded-xl border bg-card p-5 space-y-4">
        <div><label className="text-sm font-medium">存储方式</label><select className="mt-1 w-full rounded-md border p-2 text-sm"><option>本地存储</option><option>MinIO</option><option>AWS S3</option></select></div>
        <div><label className="text-sm font-medium">存储路径</label><input defaultValue="./uploads" className="mt-1 w-full rounded-md border p-2 text-sm" /></div>
        <button className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground">保存</button>
      </div>
    </div>
  );
}
