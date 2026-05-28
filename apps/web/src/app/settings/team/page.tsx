import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function TeamPage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader title="团队管理" description="管理团队成员和权限" />
      <div className="flex items-center justify-center py-20 text-muted-foreground">团队管理功能即将上线</div>
    </div>
  );
}
