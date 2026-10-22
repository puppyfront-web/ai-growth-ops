import { describe, expect, it } from 'vitest';
import {
  buildUnifiedFunnel,
  type UnifiedFunnelInput
} from '../../../packages/shared/src/funnel-analytics';

function input(overrides: Partial<UnifiedFunnelInput> = {}): UnifiedFunnelInput {
  return {
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-10-01T00:00:00.000Z',
    days: 30,
    published: 10,
    interactions: 200,
    leads: 40,
    customers: 20,
    deals: 12,
    won: 3,
    pipelineValue: 80000,
    wonRevenue: 36000,
    byChannel: [],
    byContent: [],
    overdue: { leads: 0, customers: 0, deals: 0 },
    ...overrides
  };
}

describe('buildUnifiedFunnel', () => {
  it('is empty-safe and never divides by zero', () => {
    const result = buildUnifiedFunnel(
      input({
        published: 0,
        interactions: 0,
        leads: 0,
        customers: 0,
        deals: 0,
        won: 0,
        pipelineValue: 0,
        wonRevenue: 0
      })
    );

    expect(result.stages.map((stage) => stage.count)).toEqual([
      0, 0, 0, 0, 0, 0
    ]);
    expect(result.stages.every((stage) => stage.rateFromPrev === 0)).toBe(true);
    expect(result.revenue).toEqual({
      pipelineValue: '0.00',
      wonRevenue: '0.00',
      avgDealSize: '0.00',
      currency: 'CNY'
    });
  });

  it('builds six stages with conversion rates', () => {
    const result = buildUnifiedFunnel(input());

    expect(result.stages.map((stage) => stage.key)).toEqual([
      'published',
      'interactions',
      'leads',
      'customers',
      'deals',
      'won'
    ]);
    expect(result.stages.map((stage) => stage.count)).toEqual([
      10, 200, 40, 20, 12, 3
    ]);
    expect(result.stages[2]?.rateFromPrev).toBe(20);
    expect(result.stages[3]?.rateFromPrev).toBe(50);
    expect(result.stages[4]?.rateFromPrev).toBe(60);
    expect(result.stages[5]?.rateFromPrev).toBe(25);
    expect(result.stages[5]?.rateFromStart).toBe(30);
  });

  it('reports interactions per published item separately from rates', () => {
    const result = buildUnifiedFunnel(input());
    expect(result.stages[1]?.ratioFromPrev).toBe(20);
  });

  it('formats revenue and only averages deals with a value', () => {
    const result = buildUnifiedFunnel(
      input({
        won: 3,
        wonRevenue: 30000,
        pipelineValue: 125000.5
      })
    );

    expect(result.revenue.wonRevenue).toBe('30000.00');
    expect(result.revenue.pipelineValue).toBe('125000.50');
    expect(result.revenue.avgDealSize).toBe('10000.00');
  });

  it('normalizes channel and content money to strings', () => {
    const result = buildUnifiedFunnel(
      input({
        byChannel: [
          { channel: 'douyin', leads: 30, customers: 15, won: 2, revenue: 24000 }
        ],
        byContent: [
          {
            contentItemId: 'content-1',
            title: '获客指南',
            published: 2,
            interactions: 80,
            leads: 12,
            customers: 6,
            won: 1,
            revenue: 12000
          }
        ]
      })
    );

    expect(result.byChannel[0]?.revenue).toBe('24000.00');
    expect(result.byContent[0]?.revenue).toBe('12000.00');
  });
});
