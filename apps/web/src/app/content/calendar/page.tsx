import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function ContentCalendarPage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader title="内容日历" description="按日历查看内容排期" />
      <div className="flex items-center justify-center py-20 text-muted-foreground">内容日历视图即将上线</div>
    </div>
  );
}
