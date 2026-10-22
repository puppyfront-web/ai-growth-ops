import { describe, expect, it } from 'vitest';
import {
  DEAL_STAGE_PROBABILITY,
  buildForecast,
  type ForecastDeal
} from '../../../packages/shared/src/forecast';

const now = new Date('2026-10-19T00:00:00.000Z');

function deal(overrides: Partial<ForecastDeal> = {}): ForecastDeal {
  return {
    id: 'deal-1',
    stage: 'qualified',
    amount: 10000,
    expectedCloseDate: '2026-11-15T00:00:00.000Z',
    ...overrides
  };
}

describe('DEAL_STAGE_PROBABILITY', () => {
  it('increases monotonically through the pipeline', () => {
    expect(DEAL_STAGE_PROBABILITY.new).toBeLessThan(
      DEAL_STAGE_PROBABILITY.contacted
    );
    expect(DEAL_STAGE_PROBABILITY.contacted).toBeLessThan(
      DEAL_STAGE_PROBABILITY.qualified
    );
    expect(DEAL_STAGE_PROBABILITY.negotiation).toBeLessThan(
      DEAL_STAGE_PROBABILITY.won
    );
  });
});

describe('buildForecast', () => {
  it('weights open deals by stage probability', () => {
    const result = buildForecast(
      [
        deal({ id: 'a', stage: 'qualified', amount: 10000 }),
        deal({ id: 'b', stage: 'negotiation', amount: 20000 }),
        deal({ id: 'c', stage: 'won', amount: 5000 })
      ],
      now,
      3
    );

    expect(result.dealCount).toBe(2);
    expect(result.openAmount).toBe(30000);
    expect(result.expectedAmount).toBe(
      10000 * DEAL_STAGE_PROBABILITY.qualified +
        20000 * DEAL_STAGE_PROBABILITY.negotiation
    );
  });

  it('buckets by expected close month and unscheduled', () => {
    const result = buildForecast(
      [
        deal({ id: 'a', expectedCloseDate: '2026-10-25T00:00:00.000Z' }),
        deal({ id: 'b', expectedCloseDate: '2026-11-05T00:00:00.000Z' }),
        deal({ id: 'c', expectedCloseDate: null })
      ],
      now,
      3
    );

    expect(result.byMonth.map((bucket) => bucket.month)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      'unscheduled'
    ]);
    expect(result.byMonth.find((bucket) => bucket.month === 'unscheduled')?.count).toBe(1);
  });

  it('provides stage breakdown and committed amount', () => {
    const result = buildForecast(
      [
        deal({ id: 'a', stage: 'new', amount: 1000 }),
        deal({ id: 'b', stage: 'proposal', amount: 4000 }),
        deal({ id: 'c', stage: 'negotiation', amount: 5000 })
      ],
      now,
      3
    );

    expect(result.byStage.find((row) => row.stage === 'proposal')).toMatchObject({
      count: 1,
      amount: 4000
    });
    expect(result.committedAmount).toBe(9000);
    expect(result.worstCaseAmount).toBe(0);
    expect(result.bestCaseAmount).toBe(10000);
  });

  it('ignores invalid amounts and closed deals', () => {
    const result = buildForecast(
      [
        deal({ id: 'a', amount: Number.NaN }),
        deal({ id: 'b', amount: -100 }),
        deal({ id: 'c', stage: 'lost', amount: 9999 })
      ],
      now,
      3
    );
    expect(result.dealCount).toBe(0);
    expect(result.openAmount).toBe(0);
  });
});
