import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function RepliesPage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader title="回复记录" description="查看所有已发送的回复" />
      <div className="flex items-center justify-center py-20 text-muted-foreground">回复记录功能即将上线</div>
    </div>
  );
}
