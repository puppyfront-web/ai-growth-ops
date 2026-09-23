import { describe, expect, it } from 'vitest';
import {
  normalizeProspectingPlan,
  mergeProspectAttributions,
  prospectingPlanSchema
} from '../../../packages/shared/src/prospecting-plan';

const validPlan = {
  version: 1,
  requirement: '寻找正在考虑采购私域运营工具的中小企业负责人，排除同行服务商',
  intent: {
    version: 1,
    summary: '寻找有私域工具采购意向的中小企业负责人',
    offering: '私域运营工具',
    targetAudience: {
      roles: ['负责人'],
      industries: ['零售'],
      organizationTypes: ['中小企业'],
      regions: []
    },
    painPoints: ['私域运营效率低'],
    useCases: ['客户运营'],
    buyingSignals: ['采购', '选型'],
    exclusions: ['同行服务商'],
    ambiguities: []
  },
  strategies: [
    {
      id: 'pain',
      type: 'pain_help',
      title: '痛点求助',
      rationale: '发现主动求助者',
      enabled: true,
      priority: 1,
      queries: ['私域运营 做不起来', '私域运营 做不起来'],
      negativeSignals: ['代运营招商'],
      budget: { maxQueries: 2, maxVideos: 6 }
    },
    {
      id: 'purchase',
      type: 'purchase_evaluation',
      title: '采购选型',
      rationale: '发现正在选型的客户',
      enabled: true,
      priority: 1,
      queries: ['私域工具 选型'],
      negativeSignals: [],
      budget: { maxQueries: 1, maxVideos: 4 }
    }
  ],
  limits: {
    maxTotalQueries: 8,
    maxTotalVideos: 20,
    maxCommentsPerVideo: 30
  }
} as const;

describe('prospecting plan contract', () => {
  it('rejects invalid requirements, strategy types, and query limits', () => {
    expect(() =>
      prospectingPlanSchema.parse({ ...validPlan, requirement: '太短' })
    ).toThrow();
    expect(() =>
      prospectingPlanSchema.parse({
        ...validPlan,
        strategies: [{ ...validPlan.strategies[0], type: 'unknown' }]
      })
    ).toThrow();
    expect(() =>
      prospectingPlanSchema.parse({
        ...validPlan,
        strategies: validPlan.strategies.map((strategy) => ({
          ...strategy,
          type: 'pain_help'
        }))
      })
    ).toThrow('策略类型不能重复');
    expect(() =>
      prospectingPlanSchema.parse({
        ...validPlan,
        strategies: validPlan.strategies.map((strategy) => ({
          ...strategy,
          queries: Array.from({ length: 7 }, (_, index) => `query-${index}`)
        }))
      })
    ).toThrow();
  });

  it('reserves capacity for at least two strategy types', () => {
    const plan = normalizeProspectingPlan(validPlan, 2);
    expect(plan.strategies.filter((strategy) => strategy.enabled)).toHaveLength(
      2
    );
    expect(
      plan.strategies.map((strategy) => strategy.budget.maxVideos)
    ).toEqual([1, 1]);
  });

  it('deduplicates queries and enforces the shared video budget', () => {
    const plan = normalizeProspectingPlan(validPlan, 7);

    expect(plan.strategies[0]?.queries).toEqual(['私域运营 做不起来']);
    expect(
      plan.strategies.reduce(
        (total, strategy) => total + strategy.budget.maxVideos,
        0
      )
    ).toBeLessThanOrEqual(7);
    expect(plan.strategies.filter((strategy) => strategy.enabled)).toHaveLength(
      2
    );
  });

  it('keeps evidence from the same prospect across strategies', () => {
    const result = mergeProspectAttributions(
      [
        {
          strategyId: 'pain',
          strategyType: 'pain_help',
          query: '私域做不起来',
          evidenceIds: ['e1']
        }
      ],
      [
        {
          strategyId: 'purchase',
          strategyType: 'purchase_evaluation',
          query: '私域工具选型',
          evidenceIds: ['e2']
        }
      ]
    );

    expect(result).toHaveLength(2);
    expect(result.flatMap((item) => item.evidenceIds)).toEqual(['e1', 'e2']);
  });
});
