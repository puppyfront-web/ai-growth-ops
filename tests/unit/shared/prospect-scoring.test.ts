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
