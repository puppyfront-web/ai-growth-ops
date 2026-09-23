import { describe, it, expect } from 'vitest';
import {
  scoreProspectCandidate,
  passesProspectThreshold,
  isProspectingTaskRunnable,
  scoreProspectUser,
  mergeSemanticScore
} from '../../../packages/shared/src/prospect-scoring';

describe('scoreProspectCandidate', () => {
  it('scores high for keyword and price inquiry', () => {
    const result = scoreProspectCandidate({
      content: '想了解一下企业版价格和演示方案',
      keywords: ['企业版', 'SaaS'],
      icpHighIntentKeywords: ['价格', '演示'],
      videoTitle: '企业版 SaaS 选型指南'
    });
    expect(result.relevanceScore).toBeGreaterThanOrEqual(50);
    expect(result.leadLevel).toBe('A');
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
  });

  it('filters spam candidates', () => {
    const result = scoreProspectCandidate({
      content: '加微 vx 代刷兼职',
      keywords: ['sunscreen'],
      icpHighIntentKeywords: []
    });
    expect(result.leadLevel).toBe('D');
    expect(passesProspectThreshold(result, 40)).toBe(false);
  });
});

describe('isProspectingTaskRunnable', () => {
  it('allows draft, failed, and completed tasks to be requested again', () => {
    expect(isProspectingTaskRunnable('draft')).toBe(true);
    expect(isProspectingTaskRunnable('failed')).toBe(true);
    expect(isProspectingTaskRunnable('completed')).toBe(true);
    expect(isProspectingTaskRunnable('running')).toBe(false);
  });
});

describe('scoreProspectUser', () => {
  it('takes the strongest comment and unions matched keywords', () => {
    const result = scoreProspectUser({
      contents: ['随便看看', '企业版怎么报价，想采购'],
      keywords: ['企业版', '采购'],
      icpHighIntentKeywords: ['报价']
    });

    expect(result.leadLevel).toBe('A');
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(['企业版', '采购', '报价'])
    );
  });

  it('rewards users who commented repeatedly', () => {
    const once = scoreProspectUser({
      contents: ['企业版了解一下'],
      keywords: ['企业版']
    });
    const repeated = scoreProspectUser({
      contents: ['企业版了解一下', '企业版还有别的套餐吗', '企业版能试用吗'],
      keywords: ['企业版']
    });

    expect(repeated.relevanceScore).toBeGreaterThan(once.relevanceScore);
  });

  it('boosts ICP role and industry matches on nickname or comment', () => {
    const base = scoreProspectUser({
      contents: ['企业版了解一下'],
      keywords: ['企业版']
    });
    const withIcp = scoreProspectUser({
      contents: ['企业版了解一下'],
      keywords: ['企业版'],
      icpTargetRoles: ['经理'],
      icpTargetIndustries: ['教育'],
      profileText: '张经理 · 教育科技'
    });

    expect(withIcp.relevanceScore).toBeGreaterThan(base.relevanceScore);
  });

  it('caps score when excluded ICP keywords appear', () => {
    const result = scoreProspectUser({
      contents: ['企业版价格多少，学生兼职推广'],
      keywords: ['企业版'],
      icpHighIntentKeywords: ['价格'],
      icpExcludedKeywords: ['兼职']
    });

    expect(result.relevanceScore).toBeLessThanOrEqual(25);
    expect(passesProspectThreshold(result, 40)).toBe(false);
  });
});

describe('mergeSemanticScore', () => {
  const base = scoreProspectUser({
    contents: ['企业版了解一下'],
    keywords: ['企业版']
  });

  it('prefers semantic output and marks its source', () => {
    const merged = mergeSemanticScore(base, {
      relevanceScore: 88,
      leadLevel: 'A',
      intent: '采购意向',
      summary: '明确询问企业版采购',
      matchedKeywords: ['企业版']
    });

    expect(merged.relevanceScore).toBe(88);
    expect(merged.intent).toBe('采购意向');
    expect(merged.scoreSource).toBe('skill');
  });

  it('falls back to rules when semantic output is missing or invalid', () => {
    expect(mergeSemanticScore(base, null).scoreSource).toBe('rules');
    expect(
      mergeSemanticScore(base, {
        relevanceScore: 5000,
        leadLevel: 'Z' as never
      }).scoreSource
    ).toBe('rules');
  });
});

describe('seller-signal exclusion (同行排除)', () => {
  it('excludes the real-world peer promotion comment found in production', () => {
    const result = scoreProspectCandidate({
      content:
        '工业采购，供需之间，如何更好实现双向奔赴？AI驱动，让配货更准，找货更快，供货更稳！一路赋能，不可"货"缺！#闪耀登场',
      keywords: ['AI转型'],
      icpHighIntentKeywords: ['采购', '合作'],
      videoTitle: '跨境电商新模式？用AI做全球生意'
    });
    expect(result.sellerSignal).toBe(true);
    expect(result.leadLevel).toBe('D');
    expect(result.relevanceScore).toBeLessThanOrEqual(25);
    expect(passesProspectThreshold(result, 40)).toBe(false);
  });

  it('excludes common supplier recruiting phrases', () => {
    for (const content of [
      '源头厂家直销，支持一件代发',
      '我们工厂专业生产二十年，诚招代理',
      '长期供货稳定，私信合作'
    ]) {
      const result = scoreProspectCandidate({
        content,
        keywords: ['工业除尘设备'],
        icpHighIntentKeywords: ['合作', '定制']
      });
      expect(result.sellerSignal, content).toBe(true);
      expect(passesProspectThreshold(result, 40)).toBe(false);
    }
  });

  it('does not flag buyer-side questions as sellers', () => {
    const result = scoreProspectCandidate({
      content: '你们怎么加盟？想代理这个产品，多少钱能上门装',
      keywords: ['除尘设备'],
      icpHighIntentKeywords: ['加盟', '代理']
    });
    expect(result.sellerSignal).toBeUndefined();
    expect(result.leadLevel).toBe('A');
    expect(passesProspectThreshold(result, 40)).toBe(true);
  });

  it('keeps the exclusion even when the semantic skill scores the peer high', () => {
    const rule = scoreProspectUser({
      contents: ['厂家直销一手货源，长期供货'],
      keywords: ['供应链'],
      icpHighIntentKeywords: ['合作']
    });
    const merged = mergeSemanticScore(rule, {
      relevanceScore: 95,
      leadLevel: 'A',
      intent: '合作意向',
      summary: '高度相关',
      matchedKeywords: ['供应链']
    });
    expect(merged.leadLevel).toBe('D');
    expect(merged.relevanceScore).toBeLessThanOrEqual(25);
  });
});

describe('comment-funnel seller detection (评论区引流)', () => {
  it('excludes the real-world funnel comment missed before', () => {
    const result = scoreProspectCandidate({
      content:
        'AI导演工作流Skill（3+2工作流3.0） 为精品剧而生。这期演示场景资产的构建逻辑，希望对你有帮助。想体验朋友欢迎评论区留言',
      keywords: ['AI工厂改造'],
      icpHighIntentKeywords: ['演示', '体验']
    });
    expect(result.sellerSignal).toBe(true);
    expect(result.leadLevel).toBe('D');
    expect(passesProspectThreshold(result, 40)).toBe(false);
  });
});

describe('industry-commentary exclusion (行业解说排除)', () => {
  it('excludes the Seedance-style third-person commentary found in production', () => {
    const result = scoreProspectCandidate({
      content:
        'Seedance 2.5 重新定义 AI 生视频赛道 Seedance 2.5 重新定义 AI 生视频赛道，它不再只是内容创作工具，而是面向工业场景的物理仿真引擎。合作客户多为车企、机器人、无人机企业，用来批量生成自动驾驶、机器人训练所需仿真数据。但技术领先背后暗藏隐患：创作者反馈模型存在抽卡、物理穿帮问题。',
      keywords: ['AI工厂改造'],
      icpHighIntentKeywords: ['合作', '批量']
    });
    expect(result.sellerSignal).toBe(true);
    expect(result.leadLevel).toBe('D');
    expect(passesProspectThreshold(result, 40)).toBe(false);
  });

  it('keeps buyers asking about cases or batch capability', () => {
    const asksCase = scoreProspectCandidate({
      content: '有没有落地案例可以看看？我们厂想批量生成产品图',
      keywords: ['AI工厂改造'],
      icpHighIntentKeywords: ['案例', '批量']
    });
    expect(asksCase.sellerSignal).toBeUndefined();
    expect(passesProspectThreshold(asksCase, 40)).toBe(true);
  });
});

describe('news/commentary and nickname false positives (自审回归)', () => {
  it('excludes news commentary about price wars and model launches', () => {
    for (const content of [
      '深度解读Grok 4.6：马斯克掀起硅谷AI价格战，顶尖模型不再是奢侈品',
      'OpenClaw 2.0 深度观察，代码可以 AI 批量生成，但产品窗口期不会等你',
      '刚看完工信部"人工智能+软件"专项行动实施方案的解读，感觉行业要变天',
      '阿里正式发布秒悟团队版，面向企业推出一站式 AI 应用创作平台'
    ]) {
      const result = scoreProspectCandidate({
        content,
        keywords: ['AI转型'],
        icpHighIntentKeywords: ['价格', '批量', '方案']
      });
      expect(result.sellerSignal, content).toBe(true);
      expect(passesProspectThreshold(result, 40)).toBe(false);
    }
  });

  it('does not score keywords from nicknames', () => {
    const result = scoreProspectCandidate({
      content: '[赞][赞]希望大家都能乘上AI这波东风',
      keywords: ['AI转型'],
      icpHighIntentKeywords: [],
      profileText: '米歇尔AI转型'
    });
    expect(result.matchedKeywords).toEqual([]);
    expect(result.relevanceScore).toBeLessThan(40);
  });

  it('keeps real price asks (价格战 negative lookahead)', () => {
    const result = scoreProspectCandidate({
      content: '你们AI工厂改造服务价格怎么样？我们厂想了解',
      keywords: ['AI工厂改造'],
      icpHighIntentKeywords: ['价格']
    });
    expect(result.leadLevel).toBe('A');
    expect(passesProspectThreshold(result, 40)).toBe(true);
  });
});
