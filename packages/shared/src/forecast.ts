/**
 * Simple stage-weighted sales forecast. It is intentionally explainable:
 * probability by stage × amount, bucketed by expected close month.
 */

export type ForecastStage =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost';

export const DEAL_STAGE_PROBABILITY: Record<ForecastStage, number> = {
  new: 0.1,
  contacted: 0.2,
  qualified: 0.4,
  proposal: 0.6,
  negotiation: 0.75,
  won: 1,
  lost: 0
};

export type ForecastDeal = {
  id: string;
  stage: ForecastStage;
  amount: number;
  expectedCloseDate?: string | null;
};

export type ForecastMonthBucket = {
  month: string;
  count: number;
  openAmount: number;
  expectedAmount: number;
};

export type ForecastStageRow = {
  stage: ForecastStage;
  probability: number;
  count: number;
  amount: number;
  expectedAmount: number;
};

export type ForecastResult = {
  dealCount: number;
  openAmount: number;
  expectedAmount: number;
  committedAmount: number;
  bestCaseAmount: number;
  worstCaseAmount: number;
  byMonth: ForecastMonthBucket[];
  byStage: ForecastStageRow[];
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}`;
}

function monthsFrom(now: Date, count: number): string[] {
  const result: string[] = [];
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let index = 0; index < count; index += 1) {
    result.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

export function buildForecast(
  deals: ForecastDeal[],
  now: Date = new Date(),
  months = 6
): ForecastResult {
  const stageOrder: ForecastStage[] = [
    'new',
    'contacted',
    'qualified',
    'proposal',
    'negotiation'
  ];
  const monthKeys = monthsFrom(now, Math.max(1, months));
  const monthMap = new Map<string, ForecastMonthBucket>(
    [...monthKeys, 'unscheduled'].map((month) => [
      month,
      { month, count: 0, openAmount: 0, expectedAmount: 0 }
    ])
  );
  const stageMap = new Map<ForecastStage, ForecastStageRow>(
    stageOrder.map((stage) => [
      stage,
      {
        stage,
        probability: DEAL_STAGE_PROBABILITY[stage],
        count: 0,
        amount: 0,
        expectedAmount: 0
      }
    ])
  );

  let dealCount = 0;
  let openAmount = 0;
  let expectedAmount = 0;
  let committedAmount = 0;

  for (const deal of deals) {
    if (deal.stage === 'won' || deal.stage === 'lost') continue;
    if (!Number.isFinite(deal.amount) || deal.amount <= 0) continue;
    const probability = DEAL_STAGE_PROBABILITY[deal.stage] ?? 0;
    const weighted = deal.amount * probability;

    dealCount += 1;
    openAmount += deal.amount;
    expectedAmount += weighted;
    if (probability >= 0.6) committedAmount += deal.amount;

    const month = deal.expectedCloseDate
      ? (() => {
          const date = new Date(deal.expectedCloseDate);
          if (Number.isNaN(date.getTime())) return 'unscheduled';
          const key = monthKey(date);
          return monthMap.has(key) ? key : 'unscheduled';
        })()
      : 'unscheduled';
    const bucket = monthMap.get(month)!;
    bucket.count += 1;
    bucket.openAmount += deal.amount;
    bucket.expectedAmount += weighted;

    const stageRow = stageMap.get(deal.stage as ForecastStage);
    if (stageRow) {
      stageRow.count += 1;
      stageRow.amount += deal.amount;
      stageRow.expectedAmount += weighted;
    }
  }

  return {
    dealCount,
    openAmount: round(openAmount),
    expectedAmount: round(expectedAmount),
    committedAmount: round(committedAmount),
    bestCaseAmount: round(openAmount),
    worstCaseAmount: 0,
    byMonth: [...monthMap.values()].map((bucket) => ({
      ...bucket,
      openAmount: round(bucket.openAmount),
      expectedAmount: round(bucket.expectedAmount)
    })),
    byStage: [...stageMap.values()].map((row) => ({
      ...row,
      amount: round(row.amount),
      expectedAmount: round(row.expectedAmount)
    }))
  };
}
