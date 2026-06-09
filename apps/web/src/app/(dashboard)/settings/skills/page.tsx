'use client';

import { useQuery } from '@tanstack/react-query';
import { getSkills } from '@/lib/api/settings';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatDate } from '@/lib/utils';

export default function SkillsPage() {
  const { data: skills, isLoading } = useQuery({
    queryKey: ['skills'],
    queryFn: getSkills
  });

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="Skill 管理"
        description="管理 AI 技能模块的运行状态和性能"
      />
      <div className="rounded-xl border bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                名称
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                状态
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                最近运行
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                总运行
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                成功率
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                平均耗时
              </th>
            </tr>
          </thead>
          <tbody>
            {skills?.map((skill) => (
              <tr
                key={skill.name}
                className="border-b last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-3 text-sm font-medium">{skill.name}</td>
                <td className="px-4 py-3">
                  <StatusBadge
                    status={skill.status === 'success' ? 'success' : 'warning'}
                    label={skill.status}
                  />
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {skill.lastRunAt
                    ? formatDate(String(skill.lastRunAt))
                    : '从未'}
                </td>
                <td className="px-4 py-3 text-sm">{skill.totalRuns}</td>
                <td className="px-4 py-3 text-sm">
                  {(skill.successRate * 100).toFixed(0)}%
                </td>
                <td className="px-4 py-3 text-sm">{skill.avgLatencyMs}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
