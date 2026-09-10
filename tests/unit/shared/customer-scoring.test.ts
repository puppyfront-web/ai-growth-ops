import { describe, it, expect } from 'vitest';
import {
  computeCustomerScores,
  buildRuleBasedProfile,
  DEFAULT_ICP_CONFIG,
  normalizeIcpConfig
} from '../../../packages/shared/src/customer-scoring';

describe('computeCustomerScores', () => {
  it('scores high intent for price inquiry', () => {
    const scores = computeCustomerScores(
      {
        displayName: '张三',
        company: '某某科技',
        role: '采购经理',
        intent: '想了解企业版价格和演示',
        channel: 'exhibition',
        status: 'active',
        activityCount: 1,
        daysSinceLastActivity: 1,
        daysSinceCreated: 2,
        linkedLeadLevels: ['A']
      },
      DEFAULT_ICP_CONFIG
    );
    expect(scores.intentScore).toBeGreaterThanOrEqual(70);
    expect(scores.fitScore).toBeGreaterThan(50);
    expect(['hot', 'warm']).toContain(scores.segment);
  });

  it('marks at_risk when idle too long', () => {
    const scores = computeCustomerScores({
      displayName: '李四',
      company: '测试公司',
      role: '职员',
      intent: '随便看看',
      channel: 'manual',
      status: 'active',
      activityCount: 0,
      daysSinceLastActivity: null,
      daysSinceCreated: 45,
      linkedLeadLevels: []
    });
    expect(scores.healthScore).toBeLessThan(50);
    expect(scores.segment).toBe('at_risk');
  });
});

describe('normalizeIcpConfig', () => {
  it('replaces invalid fields with safe defaults', () => {
    const result = normalizeIcpConfig({
      targetIndustries: 'not-an-array',
      targetRoles: ['采购', 1],
      highIntentKeywords: null
    });

    expect(result.targetIndustries).toEqual(
      DEFAULT_ICP_CONFIG.targetIndustries
    );
    expect(result.targetRoles).toEqual(['采购']);
    expect(result.highIntentKeywords).toEqual(
      DEFAULT_ICP_CONFIG.highIntentKeywords
    );
  });
});

describe('buildRuleBasedProfile', () => {
  it('extracts tags from intent', () => {
    const profile = buildRuleBasedProfile({
      displayName: '王五',
      company: 'A公司',
      role: '总监',
      intent: '咨询报价和合作方案',
      channel: 'referral',
      status: 'active',
      activityCount: 0,
      daysSinceLastActivity: null,
      daysSinceCreated: 1,
      linkedLeadLevels: []
    });
    expect(profile.tags).toContain('价格咨询');
    expect(profile.summary).toContain('王五');
  });
});
