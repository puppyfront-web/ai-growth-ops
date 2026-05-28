import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function LeadSyncPage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader title="线索同步" description="管理飞书和企微的线索同步状态" />
      <div className="flex items-center justify-center py-20 text-muted-foreground">同步管理功能即将上线</div>
    </div>
  );
}
