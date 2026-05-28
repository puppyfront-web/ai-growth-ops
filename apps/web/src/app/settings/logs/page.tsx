import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function LogsPage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader title="操作日志" description="查看系统操作日志" />
      <div className="flex items-center justify-center py-20 text-muted-foreground">操作日志功能即将上线</div>
    </div>
  );
}
