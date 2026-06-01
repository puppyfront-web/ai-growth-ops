'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';

const labelMap: Record<string, string> = {
  dashboard: '工作台',
  research: '市场调研',
  content: '内容运营',
  media: '素材库',
  publish: '发布运营',
  conversations: '评论私信',
  leads: '线索管理',
  analytics: '数据复盘',
  integrations: '集成配置',
  settings: '系统设置',
  login: '登录',
  new: '新建',
  insights: '洞察',
  opportunities: '选题机会',
  review: '审核',
  upload: '上传',
  generation: '生成',
  queue: '队列',
  jobs: '发布任务',
  manual: '人工发布',
  pipeline: '跟进看板',
  platforms: '平台账号',
  feishu: '飞书',
  wecom: '企微',
  providers: 'Provider',
  ai: 'AI配置',
  skills: 'Skill管理',
  compliance: '合规规则',
  variants: '平台版本',
  calendar: '日历',
  templates: '模板',
};

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
      <Link href="/dashboard" className="flex items-center hover:text-foreground">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {segments.map((segment, index) => {
        const href = '/' + segments.slice(0, index + 1).join('/');
        const isLast = index === segments.length - 1;
        const label = labelMap[segment] || segment;

        return (
          <span key={href} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5" />
            {isLast ? (
              <span className="text-foreground font-medium">{label}</span>
            ) : (
              <Link href={href} className="hover:text-foreground">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
