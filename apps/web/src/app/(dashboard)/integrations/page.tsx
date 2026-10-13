import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function IntegrationsPage() {
  const items = [
    {
      href: '/integrations/llm',
      title: 'LLM 配置',
      desc: '配置 AI 模型 · 驱动评论分级、回复建议、敏感审核（API Key 加密存库，不写 .env）'
    },
    {
      href: '/integrations/platforms',
      title: '平台账号',
      desc: '管理6大平台账号授权'
    },
    {
      href: '/integrations/sync',
      title: '同步与推送',
      desc: '飞书多维表格同步 · 企业微信客户联系 · Webhook 事件推送（含配置指引）'
    }
  ];

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="集成配置"
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
