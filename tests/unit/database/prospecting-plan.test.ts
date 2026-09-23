import { describe, expect, it, vi } from 'vitest';
import { compileProspectingPlan } from '../../../packages/database/src/prospecting-plan';

const requirement =
  '寻找正在考虑采购私域运营工具的中小企业负责人，优先零售行业，排除同行服务商';

function mockClient(payload: unknown) {
  return {
    chat: vi.fn().mockResolvedValue({ text: JSON.stringify(payload) }),
    getProvider: () => 'openai',
    getModel: () => 'test-model'
  } as never;
}

const modelOutput = {
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
      queries: ['私域运营做不起来'],
      negativeSignals: ['代运营招商'],
      budget: { maxQueries: 1, maxVideos: 6 }
    },
    {
      id: 'purchase',
      type: 'purchase_evaluation',
      title: '采购选型',
      rationale: '发现正在选型的客户',
      enabled: true,
      priority: 1,
      queries: ['私域工具怎么选'],
      negativeSignals: [],
      budget: { maxQueries: 1, maxVideos: 6 }
    },
    {
      id: 'price',
      type: 'price_budget',
      title: '预算价格',
      rationale: '发现询价客户',
      enabled: true,
      priority: 2,
      queries: ['私域系统多少钱'],
      negativeSignals: [],
      budget: { maxQueries: 1, maxVideos: 6 }
    }
  ]
};

describe('compileProspectingPlan', () => {
  it('compiles multiple strategies within the available crawl budget', async () => {
    const plan = await compileProspectingPlan({
      requirement,
      availableVideos: 9,
      llmClient: mockClient(modelOutput)
    });

    expect(
      new Set(plan.strategies.map((item) => item.type)).size
    ).toBeGreaterThan(1);
    expect(
      plan.strategies.reduce((total, item) => total + item.budget.maxVideos, 0)
    ).toBeLessThanOrEqual(9);
    expect(plan.requirement).toBe(requirement);
  });

  it('rejects malformed model output instead of falling back to token splitting', async () => {
    await expect(
      compileProspectingPlan({
        requirement,
        availableVideos: 20,
        llmClient: mockClient({ intent: {}, strategies: [] })
      })
    ).rejects.toThrow('意图分析结果无效');
  });
});
