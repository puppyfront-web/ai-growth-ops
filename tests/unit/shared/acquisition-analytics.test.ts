import { describe, it, expect } from 'vitest';
import {
  asKeywordList,
  buildAcquisitionAnalytics,
  clampAcquisitionDays,
  isHighIntentCandidate,
  resolveAcquisitionRange,
  type AcquisitionCandidateRow,
  type AcquisitionCustomerRow,
  type AcquisitionTaskRow
} from '../../../packages/shared/src/acquisition-analytics';

function task(
  overrides: Partial<AcquisitionTaskRow> = {}
): AcquisitionTaskRow {
  return {
    id: 'task-1',
    platform: 'douyin',
    keywords: ['企业获客'],
    status: 'completed',
    totalVideos: 5,
    totalComments: 40,
    createdAt: '2026-09-01T02:00:00.000Z',
    ...overrides
  };
}

function candidate(
  overrides: Partial<AcquisitionCandidateRow> = {}
): AcquisitionCandidateRow {
  return {
    id: 'cand-1',
    taskId: 'task-1',
    platform: 'douyin',
    keyword: '企业获客',
    relevanceScore: 72,
    leadLevel: 'A',
    customerId: null,
    createdAt: '2026-09-01T03:00:00.000Z',
    ...overrides
  };
}

function customer(
  overrides: Partial<AcquisitionCustomerRow> = {}
): AcquisitionCustomerRow {
  return {
    id: 'cust-1',
    status: 'active',
    channel: 'douyin',
    fitScore: 70,
    intentScore: 80,
    healthScore: 90,
    segment: 'hot',
    createdAt: '2026-09-01T04:00:00.000Z',
    ...overrides
  };
}

describe('isHighIntentCandidate', () => {
  it('keeps A and only high-scoring B', () => {
    expect(
      isHighIntentCandidate({ leadLevel: 'A', relevanceScore: 40 })
    ).toBe(true);
    expect(
      isHighIntentCandidate({ leadLevel: 'B', relevanceScore: 70 })
    ).toBe(true);
    expect(
      isHighIntentCandidate({ leadLevel: 'B', relevanceScore: 55 })
    ).toBe(false);
  });
});

describe('clampAcquisitionDays', () => {
  it('defaults invalid values and clamps the upper bound', () => {
    expect(clampAcquisitionDays(Number.NaN)).toBe(30);
    expect(clampAcquisitionDays(0)).toBe(1);
    expect(clampAcquisitionDays(400)).toBe(180);
  });
});

describe('asKeywordList', () => {
  it('drops non-string and empty values', () => {
    expect(asKeywordList(['企业获客', ' ', 3, null])).toEqual(['企业获客']);
  });
});

describe('resolveAcquisitionRange', () => {
  it('walks back from now by the requested day count', () => {
    const now = new Date('2026-09-05T10:00:00.000Z');
    const range = resolveAcquisitionRange(7, now);
    expect(range.days).toBe(7);
    expect(range.to.toISOString()).toBe(now.toISOString());
    expect(range.from.toISOString()).toBe('2026-08-29T10:00:00.000Z');
  });
});

describe('buildAcquisitionAnalytics', () => {
  const range = {
    from: new Date('2026-09-01T00:00:00.000Z'),
    to: new Date('2026-09-03T00:00:00.000Z'),
    days: 2
  };

  it('returns empty-safe totals when there is no activity', () => {
    const result = buildAcquisitionAnalytics({
      ...range,
      tasks: [],
      candidates: [],
      customers: []
    });
    expect(result.kpis.candidates).toBe(0);
    expect(result.kpis.conversionRate).toBe(0);
    expect(result.funnel.map((stage) => stage.count)).toEqual([0, 0, 0, 0]);
    expect(result.trend).toHaveLength(3);
  });

  it('dedupes converted customers and builds the new-pipeline funnel', () => {
    const result = buildAcquisitionAnalytics({
      ...range,
      tasks: [task()],
      candidates: [
        candidate({ id: 'a', leadLevel: 'A', customerId: 'cust-1' }),
        candidate({
          id: 'b',
          leadLevel: 'B',
          relevanceScore: 55,
          customerId: 'cust-1'
        }),
        candidate({
          id: 'c',
          leadLevel: 'C',
          relevanceScore: 30,
          customerId: null
        })
      ],
      customers: [customer({ status: 'won' })]
    });

    expect(result.kpis.candidates).toBe(3);
    expect(result.kpis.highIntent).toBe(1);
    expect(result.kpis.convertedCustomers).toBe(1);
    expect(result.kpis.wonCustomers).toBe(1);
    expect(result.kpis.conversionRate).toBe(33);
    expect(result.funnel.map((stage) => stage.key)).toEqual([
      'candidates',
      'highIntent',
      'converted',
      'won'
    ]);
    expect(result.funnel[0].rateFromPrev).toBe(100);
    expect(result.byKeyword[0]).toMatchObject({
      keyword: '企业获客',
      candidates: 3,
      converted: 2
    });
    expect(result.recentTasks[0].converted).toBe(1);
    expect(result.byCustomerStatus.find((row) => row.status === 'won')?.count).toBe(
      1
    );
    expect(result.byPlatform[0]).toMatchObject({
      key: 'douyin',
      count: 3,
      converted: 1
    });
  });

  it('groups trend points by UTC day', () => {
    const result = buildAcquisitionAnalytics({
      ...range,
      tasks: [task()],
      candidates: [
        candidate({ id: 'd1', createdAt: '2026-09-01T08:00:00.000Z' }),
        candidate({
          id: 'd2',
          createdAt: '2026-09-02T08:00:00.000Z',
          customerId: 'cust-1'
        })
      ],
      customers: [customer()]
    });
    expect(result.trend.find((point) => point.date === '2026-09-01')).toEqual({
      date: '2026-09-01',
      candidates: 1,
      converted: 0
    });
    expect(result.trend.find((point) => point.date === '2026-09-02')).toEqual({
      date: '2026-09-02',
      candidates: 1,
      converted: 1
    });
  });

  it('counts daily conversions by convertedAt, not candidate createdAt', () => {
    const result = buildAcquisitionAnalytics({
      ...range,
      tasks: [task()],
      candidates: [
        candidate({
          id: 'late-convert',
          createdAt: '2026-09-01T08:00:00.000Z',
          customerId: 'cust-1',
          convertedAt: '2026-09-02T11:00:00.000Z'
        })
      ],
      customers: [customer()]
    });

    expect(result.trend.find((point) => point.date === '2026-09-01')).toEqual({
      date: '2026-09-01',
      candidates: 1,
      converted: 0
    });
    expect(result.trend.find((point) => point.date === '2026-09-02')).toEqual({
      date: '2026-09-02',
      candidates: 0,
      converted: 1
    });
  });
});
