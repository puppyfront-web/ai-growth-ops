import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function WebhooksPage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader title="Webhook 配置" description="配置 Webhook 回调" />
      <div className="flex items-center justify-center py-20 text-muted-foreground">Webhook 配置功能即将上线</div>
    </div>
  );
}
