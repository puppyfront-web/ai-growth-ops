import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function PublishCalendarPage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader title="发布日历" description="按日历查看发布排期" />
      <div className="flex items-center justify-center py-20 text-muted-foreground">发布日历视图即将上线</div>
    </div>
  );
}
