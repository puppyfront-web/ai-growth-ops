import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function LeadRulesPage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader title="线索评级规则" description="配置线索自动评级规则" />
      <div className="flex items-center justify-center py-20 text-muted-foreground">评级规则配置即将上线</div>
    </div>
  );
}
