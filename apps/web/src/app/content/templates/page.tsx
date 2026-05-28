import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function ContentTemplatesPage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader title="内容模板" description="管理可复用的内容模板" />
      <div className="flex items-center justify-center py-20 text-muted-foreground">模板管理功能即将上线</div>
    </div>
  );
}
