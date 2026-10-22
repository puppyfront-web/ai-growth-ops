'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import {
  getPlatformCapabilities,
  type PlatformCapabilityStatus
} from '@/lib/api/platform-capabilities';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<PlatformCapabilityStatus, string> = {
  verified: '已验证',
  beta: 'Beta',
  unverified: '未验收',
  unsupported: '不支持'
};

const STATUS_STYLES: Record<PlatformCapabilityStatus, string> = {
  verified: 'bg-success/10 text-success',
  beta: 'bg-warning/10 text-warning',
  unverified: 'bg-muted text-muted-foreground',
  unsupported: 'bg-destructive/10 text-destructive'
};

function StatusCell({ status }: { status: PlatformCapabilityStatus }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_STYLES[status]
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

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
      desc: '管理平台账号授权；真实能力以本页能力矩阵为准'
    },
    {
      href: '/integrations/sync',
      title: '同步与推送',
      desc: '飞书多维表格同步 · 企业微信客户联系 · Webhook 事件推送（含配置指引）'
    }
  ];
  const { data, isLoading } = useQuery({
    queryKey: ['platform-capabilities'],
    queryFn: getPlatformCapabilities
  });
  const platforms = data?.platforms ?? [];

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="集成配置" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-sm"
          >
            <h3 className="font-semibold">{item.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
          </Link>
        ))}
      </div>

      <section className="mt-6 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-semibold">平台能力矩阵</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              仅“已验证”代表真实账号完成过对应动作；“Beta / 未验收”能力请先低量试用。
            </p>
          </div>
          <Link
            href="/integrations/platforms"
            className="text-sm text-primary hover:underline"
          >
            管理平台账号
          </Link>
        </div>

        {isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">能力矩阵加载中…</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2">平台</th>
                  <th className="pb-2">内容发布</th>
                  <th className="pb-2">主动获客</th>
                  <th className="pb-2">互动同步</th>
                  <th className="pb-2">自动回复</th>
                  <th className="pb-2">官方 API</th>
                </tr>
              </thead>
              <tbody>
                {platforms.map((platform) => (
                  <tr key={platform.key} className="border-b last:border-0">
                    <td className="py-2">
                      <div className="font-medium">{platform.label}</div>
                      {platform.note ? (
                        <p className="mt-0.5 max-w-[260px] text-xs text-muted-foreground">
                          {platform.note}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-2">
                      <StatusCell status={platform.publish} />
                    </td>
                    <td className="py-2">
                      <StatusCell status={platform.prospecting} />
                    </td>
                    <td className="py-2">
                      <StatusCell status={platform.interactionSync} />
                    </td>
                    <td className="py-2">
                      <StatusCell status={platform.reply} />
                    </td>
                    <td className="py-2">
                      <StatusCell status={platform.officialApi} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
