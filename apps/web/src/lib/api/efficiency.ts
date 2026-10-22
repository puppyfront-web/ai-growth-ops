import { apiDelete, apiGet, apiPost } from './client';

export type CostCategory = 'ad' | 'content' | 'labor' | 'tool' | 'other';

export type MarketingCost = {
  id: string;
  channel: string | null;
  contentItemId: string | null;
  category: CostCategory;
  amount: string;
  currency: string;
  incurredAt: string;
  note: string | null;
};

export type EfficiencyChannelRow = {
  channel: string;
  spend: number;
  leads: number;
  customers: number;
  won: number;
  revenue: number;
  cpl: number;
  cac: number;
  roi: number;
};

export type EfficiencyAnalytics = {
  range: { from: string; to: string; days: number };
  totals: {
    spend: number;
    revenue: number;
    leads: number;
    won: number;
    cpl: number;
    cac: number;
    roi: number;
  };
  byChannel: EfficiencyChannelRow[];
  byCategory: Array<{ category: string; amount: number }>;
};

export type AttributionAnalytics = {
  model: 'first_touch' | 'last_touch' | 'linear';
  range: { from: string; to: string; days: number };
  totalRevenue: number;
  attributedRevenue: number;
  unattributedRevenue: number;
  byChannel: Array<{ channel: string; revenue: number; deals: number }>;
  byContent: Array<{
    contentItemId: string;
    revenue: number;
    deals: number;
  }>;
};

export type ForecastAnalytics = {
  dealCount: number;
  openAmount: number;
  expectedAmount: number;
  committedAmount: number;
  bestCaseAmount: number;
  worstCaseAmount: number;
  byMonth: Array<{
    month: string;
    count: number;
    openAmount: number;
    expectedAmount: number;
  }>;
  byStage: Array<{
    stage: string;
    probability: number;
    count: number;
    amount: number;
    expectedAmount: number;
  }>;
};

export function getForecastAnalytics(months = 6): Promise<ForecastAnalytics> {
  return apiGet(`/api/analytics/forecast?months=${months}`);
}

export function getEfficiencyAnalytics(
  days = 30
): Promise<EfficiencyAnalytics> {
  return apiGet(`/api/analytics/efficiency?days=${days}`);
}

export function getAttributionAnalytics(
  days = 30,
  model: 'first_touch' | 'last_touch' | 'linear' = 'last_touch'
): Promise<AttributionAnalytics> {
  return apiGet(`/api/analytics/attribution?days=${days}&model=${model}`);
}

export function listMarketingCosts(
  days = 30
): Promise<{ items: MarketingCost[] }> {
  return apiGet(`/api/costs?days=${days}`);
}

export function createMarketingCost(input: {
  channel?: string | null;
  category?: CostCategory;
  amount: number;
  incurredAt?: string;
  note?: string;
}): Promise<MarketingCost> {
  return apiPost('/api/costs', input);
}

export function deleteMarketingCost(id: string) {
  return apiDelete(`/api/costs/${id}`);
}
