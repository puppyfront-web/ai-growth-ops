import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function SettingsPage() {
  const items = [
    {
      href: '/integrations/llm',
      title: 'LLM 配置',
      desc: '统一配置组织的文本模型与密钥'
    },
    { href: '/settings/ai', title: '素材生成配置', desc: '可选的图片与视频生成服务' },
    { href: '/settings/skills', title: 'Skill 管理', desc: '管理 AI 技能模块' },
    {
      href: '/settings/icp',
      title: 'ICP 理想客户',
      desc: '配置 Fit 评分与目标客户画像规则'
    },
    {
      href: '/settings/compliance',
      title: '合规规则',
      desc: '配置敏感词和审核规则'
    },
    {
      href: '/settings/storage',
      title: '存储配置',
      desc: '配置文件存储方式（本地/MinIO/S3）'
    },
    { href: '/settings/profile', title: '个人设置', desc: '管理个人资料' },
    { href: '/settings/team', title: '团队管理', desc: '管理团队成员和权限' },
    { href: '/settings/logs', title: '操作日志', desc: '查看系统操作日志' }
  ];

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="系统设置" description="管理系统配置" />
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
