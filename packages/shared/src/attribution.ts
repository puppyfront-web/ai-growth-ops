/**
 * Revenue attribution across touchpoints. Deal amounts stay in the source
 * currency; the caller is responsible for converting before calling.
 */

export const ATTRIBUTION_MODELS = [
  'first_touch',
  'last_touch',
  'linear'
] as const;

export type AttributionModel = (typeof ATTRIBUTION_MODELS)[number];

export const ATTRIBUTION_MODEL_LABELS: Record<AttributionModel, string> = {
  first_touch: '首触归因',
  last_touch: '末触归因',
  linear: '线性归因'
};

export type AttributionTouch = {
  id: string;
  customerId: string;
  channel: string;
  contentItemId?: string | null;
  occurredAt: string;
};

export type AttributionDeal = {
  id: string;
  customerId: string;
  amount: number;
  wonAt: string;
};

export type AttributionChannelRow = {
  channel: string;
  revenue: number;
  deals: number;
};

export type AttributionContentRow = {
  contentItemId: string;
  revenue: number;
  deals: number;
};

export type AttributionResult = {
  model: AttributionModel;
  totalRevenue: number;
  attributedRevenue: number;
  unattributedRevenue: number;
  byChannel: AttributionChannelRow[];
  byContent: AttributionContentRow[];
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function time(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function attributeRevenue(
  deals: AttributionDeal[],
  touches: AttributionTouch[],
  model: AttributionModel
): AttributionResult {
  const touchesByCustomer = new Map<string, AttributionTouch[]>();
  for (const touch of touches) {
    const list = touchesByCustomer.get(touch.customerId) ?? [];
    list.push(touch);
    touchesByCustomer.set(touch.customerId, list);
  }
  for (const list of touchesByCustomer.values()) {
    list.sort((a, b) => time(a.occurredAt) - time(b.occurredAt));
  }

  const channelMap = new Map<string, AttributionChannelRow>();
  const contentMap = new Map<string, AttributionContentRow>();
  let totalRevenue = 0;
  let attributedRevenue = 0;
  let unattributedRevenue = 0;

  const addCredit = (amount: number, touch: AttributionTouch | null) => {
    if (!touch) return;
    const channelRow = channelMap.get(touch.channel) ?? {
      channel: touch.channel,
      revenue: 0,
      deals: 0
    };
    channelRow.revenue += amount;
    channelRow.deals += 1;
    channelMap.set(touch.channel, channelRow);

    if (touch.contentItemId) {
      const contentRow = contentMap.get(touch.contentItemId) ?? {
        contentItemId: touch.contentItemId,
        revenue: 0,
        deals: 0
      };
      contentRow.revenue += amount;
      contentRow.deals += 1;
      contentMap.set(touch.contentItemId, contentRow);
    }
    attributedRevenue += amount;
  };

  for (const deal of deals) {
    const amount =
      Number.isFinite(deal.amount) && deal.amount > 0 ? deal.amount : 0;
    totalRevenue += amount;
    const wonAt = time(deal.wonAt);
    const eligible = (touchesByCustomer.get(deal.customerId) ?? []).filter(
      (touch) => time(touch.occurredAt) <= wonAt
    );
    if (eligible.length === 0) {
      if (amount > 0) unattributedRevenue += amount;
      continue;
    }

    if (model === 'first_touch') {
      addCredit(amount, eligible[0]!);
    } else if (model === 'last_touch') {
      addCredit(amount, eligible[eligible.length - 1]!);
    } else {
      const share = amount / eligible.length;
      for (const touch of eligible) {
        addCredit(share, touch);
      }
    }
  }

  const byChannel = [...channelMap.values()]
    .map((row) => ({
      ...row,
      revenue: roundMoney(row.revenue)
    }))
    .sort((a, b) => b.revenue - a.revenue);
  const byContent = [...contentMap.values()]
    .map((row) => ({
      ...row,
      revenue: roundMoney(row.revenue)
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    model,
    totalRevenue: roundMoney(totalRevenue),
    attributedRevenue: roundMoney(attributedRevenue),
    unattributedRevenue: roundMoney(unattributedRevenue),
    byChannel,
    byContent
  };
}
