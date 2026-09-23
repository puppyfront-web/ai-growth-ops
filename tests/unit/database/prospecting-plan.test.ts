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

  it('repairs common real-model deviations instead of failing the plan', async () => {
    const plan = await compileProspectingPlan({
      requirement,
      availableVideos: 20,
      llmClient: mockClient({
        intent: {
          summary: '寻找有私域工具采购意向的负责人',
          offering: '私域运营工具',
          targetAudience: {
            roles: ['负责人'],
            industries: null,
            organizationTypes: ['中小企业'],
            regions: null,
            extraField: true
          },
          painPoints: null,
          useCases: ['客户运营'],
          buyingSignals: ['采购'],
          exclusions: ['同行'],
          ambiguities: null
        },
        strategies: [
          {
            id: 'pain',
            type: 'pain_help',
            title: '痛点求助',
            rationale: '发现主动求助者',
            priority: '1',
            queries: ['私域运营做不起来', '私域运营太难了怎么办', '私域运营入门', '超长'.repeat(60)],
            budget: 70,
            unknownField: 1
          },
          {
            id: 'purchase',
            type: 'purchase_evaluation',
            title: '采购选型',
            rationale: '发现正在选型的客户',
            enabled: true,
            priority: 9,
            queries: ['私域工具怎么选'],
            budget: { maxQueries: 99, maxVideos: 500 }
          },
          {
            id: 'pain-dup',
            type: 'pain_help',
            title: '重复类型',
            rationale: '应被丢弃',
            queries: ['重复'],
            budget: { maxQueries: 1, maxVideos: 3 }
          }
        ]
      })
    });

    const pain = plan.strategies.find((item) => item.id === 'pain');
    expect(pain).toBeDefined();
    // budget 数字按视频额度钳制、queries 修剪到 3 条、字符串 priority 修复；
    // normalize 再按可用额度在策略间重新分配
    expect(pain!.budget.maxQueries).toBeLessThanOrEqual(3);
    expect(pain!.budget.maxVideos).toBeLessThanOrEqual(20);
    expect(pain!.queries).toHaveLength(3);
    expect(pain!.priority).toBe(1);
    expect(plan.intent.painPoints).toEqual([]);
    expect(plan.intent.targetAudience.industries).toEqual([]);
    const purchase = plan.strategies.find((item) => item.id === 'purchase');
    expect(purchase!.budget.maxQueries).toBeLessThanOrEqual(3);
    expect(purchase!.budget.maxVideos).toBeLessThanOrEqual(30);
    expect(purchase!.priority).toBe(3);
    // 同类型重复策略被丢弃
    expect(plan.strategies.filter((item) => item.type === 'pain_help')).toHaveLength(1);
  });

  it('retries once with validation feedback when the first output is truncated', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce({ text: '{"intent": {"version": 1, "summ' })
      .mockResolvedValueOnce({ text: JSON.stringify(modelOutput) });
    const plan = await compileProspectingPlan({
      requirement,
      availableVideos: 20,
      llmClient: { chat, getProvider: () => 'openai', getModel: () => 'test' } as never
    });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(plan.strategies.length).toBeGreaterThanOrEqual(2);
    const retryPrompt = chat.mock.calls[1][0].map((m: { content: string }) => m.content).join('\n');
    expect(retryPrompt).toContain('未通过结构校验');
  });
});
