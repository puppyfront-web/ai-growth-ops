import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function IntegrationsPage() {
  const items = [
    {
      href: '/integrations/platforms',
      title: '平台账号',
      desc: '管理6大平台账号授权'
    },
    {
      href: '/integrations/feishu',
      title: '飞书配置',
      desc: '配置飞书多维表格同步'
    },
    {
      href: '/integrations/wecom',
      title: '企微配置',
      desc: '配置企业微信客户联系'
    },
    {
      href: '/integrations/providers',
      title: 'Provider 配置',
      desc: '管理各 Provider 状态'
    },
    {
      href: '/integrations/webhooks',
      title: 'Webhook 管理',
      desc: '管理 Webhook 订阅和事件推送'
    }
  ];

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="集成配置"
        description="管理平台账号、外部系统和 Provider"
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border bg-card p-5 hover:shadow-sm transition-shadow"
          >
            <h3 className="font-semibold">{item.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
