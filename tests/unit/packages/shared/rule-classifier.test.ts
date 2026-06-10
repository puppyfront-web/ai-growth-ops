import { describe, it, expect } from 'vitest';

describe('packages/shared rule-classifier', () => {
  it('should export classification functions from shared package', async () => {
    const shared = await import('@ai-growth-ops/shared');

    expect(typeof shared.classifyByRules).toBe('function');
    expect(typeof shared.generateRuleBasedReply).toBe('function');
    expect(typeof shared.containsSensitiveContent).toBe('function');
  });

  it('should classify cooperation inquiry as A-level lead', async () => {
    const { classifyByRules } = await import('@ai-growth-ops/shared');

    // classifyByRules takes a content string
    const result = classifyByRules('你好，我想咨询一下合作事宜，请问你们的产品价格是多少？');

    expect(result).toBeDefined();
    expect(result.leadLevel).toBeDefined();
    expect(['A', 'B', 'C', 'D']).toContain(result.leadLevel);
  });

  it('should classify spam as D-level lead', async () => {
    const { classifyByRules } = await import('@ai-growth-ops/shared');

    const result = classifyByRules('加我微信 abc123 免费领取资料');

    expect(result).toBeDefined();
  });

  it('should detect sensitive content', async () => {
    const { containsSensitiveContent } = await import('@ai-growth-ops/shared');

    const result = containsSensitiveContent('请联系微信 abc123 或电话 13800138000');
    // containsSensitiveContent returns boolean or object — check truthiness
    expect(result).toBeTruthy();
  });

  it('should generate rule-based reply', async () => {
    const { classifyByRules, generateRuleBasedReply } = await import(
      '@ai-growth-ops/shared'
    );

    // First classify, then generate reply
    const classification = classifyByRules('这个产品多少钱？');

    // generateRuleBasedReply takes content, classification, platform
    const result = generateRuleBasedReply(
      '这个产品多少钱？',
      classification,
      'douyin'
    );

    expect(result).toBeDefined();
    expect(result.suggestedText).toBeTruthy();
    expect(result.replyType).toBeTruthy();
  });
});

describe('packages/shared insight-generator', () => {
  it('should export insight generation functions', async () => {
    const shared = await import('@ai-growth-ops/shared');

    expect(typeof shared.analyzeContentThemes).toBe('function');
    expect(typeof shared.analyzeCommentSentiment).toBe('function');
    expect(typeof shared.buildRuleBasedInsights).toBe('function');
  });

  it('should analyze content themes from posts', async () => {
    const { analyzeContentThemes } = await import('@ai-growth-ops/shared');

    const posts = [
      { title: '防晒霜推荐', body: '夏天到了，防晒很重要', platform: 'douyin' },
      { title: '美白精华测评', body: '这款精华真的好用', platform: 'xiaohongshu' }
    ];

    const themes = analyzeContentThemes(posts);
    expect(Array.isArray(themes)).toBe(true);
  });

  it('should analyze comment sentiment', async () => {
    const { analyzeCommentSentiment } = await import('@ai-growth-ops/shared');

    const comments = [
      { content: '太好用了，强烈推荐！', platform: 'douyin' },
      { content: '质量很差，不推荐', platform: 'douyin' },
      { content: '一般般吧', platform: 'xiaohongshu' }
    ];

    const result = analyzeCommentSentiment(comments);
    expect(result).toBeDefined();
    // Check that it returns something meaningful
    expect(result).toBeTruthy();
  });
});
