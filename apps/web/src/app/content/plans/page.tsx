import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function ContentPlansPage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader title="内容计划" description="管理内容计划" />
      <div className="flex items-center justify-center py-20 text-muted-foreground">内容计划功能即将上线</div>
    </div>
  );
}
