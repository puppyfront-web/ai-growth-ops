import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function MediaFoldersPage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader title="素材文件夹" description="按文件夹管理素材" />
      <div className="flex items-center justify-center py-20 text-muted-foreground">文件夹视图即将上线</div>
    </div>
  );
}
