import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function ResearchAnalyticsPage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader title="调研分析" description="调研任务效果和选题转化分析" />
      <div className="flex items-center justify-center py-20 text-muted-foreground">调研分析功能即将上线</div>
    </div>
  );
}
