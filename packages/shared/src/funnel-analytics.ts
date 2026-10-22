/**
 * Unified acquisition → revenue funnel.
 *
 * Stage counts are occurrence counts inside the requested window, not a strict
 * cohort. The funnel is intentionally additive to the existing prospecting-only
 * analytics so legacy screens keep working.
 */

export const UNIFIED_FUNNEL_STAGE_KEYS = [
  'published',
  'interactions',
  'leads',
  'customers',
  'deals',
  'won'
] as const;

export type UnifiedFunnelStageKey =
  (typeof UNIFIED_FUNNEL_STAGE_KEYS)[number];

export type UnifiedFunnelStage = {
  key: UnifiedFunnelStageKey;
  label: string;
  count: number;
  rateFromPrev: number;
  rateFromStart: number;
  ratioFromPrev: number;
};

export type UnifiedFunnelChannelRow = {
  channel: string;
  leads: number;
  customers: number;
  won: number;
  revenue: string;
};

export type UnifiedFunnelContentRow = {
  contentItemId: string;
  title: string;
  published: number;
  interactions: number;
  leads: number;
  customers: number;
  won: number;
  revenue: string;
};

export type UnifiedFunnelInput = {
  from: string;
  to: string;
  days: number;
  published: number;
  interactions: number;
  leads: number;
  customers: number;
  deals: number;
  won: number;
  pipelineValue: number;
  wonRevenue: number;
  byChannel: Array<{
    channel: string;
    leads: number;
    customers: number;
    won: number;
    revenue: number;
  }>;
  byContent: Array<{
    contentItemId: string;
    title: string;
    published: number;
    interactions: number;
    leads: number;
    customers: number;
    won: number;
    revenue: number;
  }>;
  overdue: { leads: number; customers: number; deals: number };
};

export type UnifiedFunnelAnalytics = {
  range: { from: string; to: string; days: number };
  stages: UnifiedFunnelStage[];
  revenue: {
    pipelineValue: string;
    wonRevenue: string;
    avgDealSize: string;
    currency: string;
  };
  byChannel: UnifiedFunnelChannelRow[];
  byContent: UnifiedFunnelContentRow[];
  overdue: { leads: number; customers: number; deals: number };
};

const STAGE_LABELS: Record<UnifiedFunnelStageKey, string> = {
  published: '发布内容',
  interactions: '互动',
  leads: '线索',
  customers: '客户',
  deals: '商机',
  won: '成交'
};

function rate(count: number, base: number): number {
  if (base <= 0) return 0;
  return Math.round((count / base) * 100);
}

function ratio(count: number, base: number): number {
  if (base <= 0) return 0;
  return Math.round((count / base) * 10) / 10;
}

function money(value: number): string {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

export function buildUnifiedFunnel(
  input: UnifiedFunnelInput
): UnifiedFunnelAnalytics {
  const counts = [
    input.published,
    input.interactions,
    input.leads,
    input.customers,
    input.deals,
    input.won
  ];
  const start = counts[0] ?? 0;

  const stages = UNIFIED_FUNNEL_STAGE_KEYS.map((key, index) => {
    const count = counts[index] ?? 0;
    const previous = index === 0 ? 0 : counts[index - 1] ?? 0;
    return {
      key,
      label: STAGE_LABELS[key],
      count,
      rateFromPrev: index === 0 ? 0 : rate(count, previous),
      rateFromStart: key === 'published' ? (count > 0 ? 100 : 0) : rate(count, start),
      ratioFromPrev: index === 0 ? 0 : ratio(count, previous)
    };
  });

  const wonCount = input.won;
  const avgDealSize = wonCount > 0 ? input.wonRevenue / wonCount : 0;

  return {
    range: { from: input.from, to: input.to, days: input.days },
    stages,
    revenue: {
      pipelineValue: money(input.pipelineValue),
      wonRevenue: money(input.wonRevenue),
      avgDealSize: money(avgDealSize),
      currency: 'CNY'
    },
    byChannel: input.byChannel.map((row) => ({
      ...row,
      revenue: money(row.revenue)
    })),
    byContent: input.byContent.map((row) => ({
      ...row,
      revenue: money(row.revenue)
    })),
    overdue: input.overdue
  };
}
