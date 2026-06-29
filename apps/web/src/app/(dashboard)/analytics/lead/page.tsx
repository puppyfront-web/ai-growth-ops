'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAnalyticsOverview, getLeadTrend } from '@/lib/api/analytics';
import { listLeads } from '@/lib/api/leads';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

const FUNNEL_STAGES = [
  { key: 'NEW', label: '新线索' },
  { key: 'QUALIFIED', label: '已验证' },
  { key: 'ASSIGNED', label: '已分配' },
  { key: 'CONTACTED', label: '已联系' },
  { key: 'ADDED_WECOM', label: '已加企微' },
  { key: 'WON', label: '已成交' }
] as const;

const PIE_COLORS = ['#0f766e', '#0891b2', '#7c3aed', '#db2777', '#d97706', '#475569'];

export default function LeadAnalyticsPage() {
  const {
    data: overview,
    isLoading,
    isError: overviewError,
    refetch: refetchOverview
  } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: getAnalyticsOverview
  });
  const { data: trend } = useQuery({
    queryKey: ['lead-trend'],
    queryFn: getLeadTrend
  });
  // Pull all leads (page-size bumped) so we can compute funnel / distribution
  // client-side without a new aggregation endpoint.
  const { data: allLeads } = useQuery({
    queryKey: ['leads', { pageSize: 1000 }],
    queryFn: () => listLeads({ pageSize: 1000 })
  });

  const funnel = useMemo(() => {
    const leads = allLeads?.items ?? [];
    return FUNNEL_STAGES.map((s, i) => {
      const count = leads.filter((l) => l.status === s.key).length;
      const prev = i === 0 ? count : leads.filter((l) => l.status === FUNNEL_STAGES[0].key).length;
      return {
        stage: s.label,
        count,
        rate: prev > 0 ? Math.round((count / prev) * 100) : 0
      };
    });
  }, [allLeads]);

  const byPlatform = useMemo(() => {
    const leads = allLeads?.items ?? [];
    const map = new Map<string, number>();
    for (const l of leads) map.set(l.sourcePlatform, (map.get(l.sourcePlatform) ?? 0) + 1);
    return Array.from(map, ([name, value]) => ({ name, value }));
  }, [allLeads]);

  const byLevel = useMemo(() => {
    const leads = allLeads?.items ?? [];
    return (['A', 'B', 'C', 'D'] as const).map((lv) => ({
      level: `${lv}级`,
      count: leads.filter((l) => l.level === lv).length
    }));
  }, [allLeads]);

  if (isLoading) return <LoadingState />;
  if (overviewError) return <ErrorState onRetry={() => refetchOverview()} />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="线索分析" description="线索来源、等级和转化分析" />
      {overview && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-6">
          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm text-muted-foreground">合格线索</div>
            <div className="text-2xl font-bold">{overview.totalLeads}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm text-muted-foreground">互动总数</div>
            <div className="text-2xl font-bold">
              {overview.totalInteractions}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm text-muted-foreground">内容项</div>
            <div className="text-2xl font-bold">
              {overview.totalContentItems}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm text-muted-foreground">选题机会</div>
            <div className="text-2xl font-bold">
              {overview.contentOpportunities}
            </div>
          </div>
        </div>
      )}
      {trend && trend.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">线索趋势</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="total" fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Conversion funnel */}
      <div className="rounded-xl border bg-card p-5 mt-6">
        <h3 className="font-semibold mb-4">转化漏斗</h3>
        <div className="space-y-2">
          {funnel.map((s, i) => {
            const max = funnel[0]?.count || 1;
            const widthPct = Math.max(4, Math.round((s.count / max) * 100));
            return (
              <div key={s.stage} className="flex items-center gap-3">
                <span className="w-20 text-sm text-muted-foreground">{s.stage}</span>
                <div className="flex-1 bg-muted/40 rounded h-8 relative overflow-hidden">
                  <div
                    className="h-full flex items-center px-3 text-xs text-white font-medium transition-all"
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: PIE_COLORS[i % PIE_COLORS.length]
                    }}
                  >
                    {s.count}
                  </div>
                </div>
                <span className="w-12 text-xs text-muted-foreground text-right">
                  {s.rate}%
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          百分比为相对「新线索」阶段的转化率
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {/* Source distribution */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">来源分布</h3>
          {byPlatform.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={byPlatform}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(e) => `${e.name}: ${e.value}`}
                >
                  {byPlatform.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">暂无数据</p>
          )}
        </div>

        {/* Level distribution */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">等级分布</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byLevel} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="level" tick={{ fontSize: 12 }} width={40} />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {byLevel.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
