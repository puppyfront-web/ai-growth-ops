import { describe, expect, it } from 'vitest';
import {
  classifyByRules,
  generateRuleBasedReply,
  containsSensitiveContent,
} from '../../../apps/runtime-core/src/tools/rule-classifier.js';

describe('classifyByRules', () => {
  it('classifies price inquiry as A-level', () => {
    const result = classifyByRules('请问这个多少钱？');
    expect(result.intent).toBe('price_inquiry');
    expect(result.leadLevel).toBe('A');
    expect(result.riskLevel).toBe('low');
    expect(result.tags).toContain('价格咨询');
  });

  it('classifies price inquiry in English', () => {
    const result = classifyByRules('What is the cost?');
    expect(result.intent).toBe('price_inquiry');
    expect(result.leadLevel).toBe('A');
  });

  it('classifies appointment request as A-level', () => {
    const result = classifyByRules('可以预约一个时间吗');
    expect(result.intent).toBe('appointment_request');
    expect(result.leadLevel).toBe('A');
    expect(result.nextAction).toBe('notify_sales');
  });

  it('classifies cooperation inquiry as A-level', () => {
    const result = classifyByRules('请问可以合作吗');
    expect(result.intent).toBe('cooperation_inquiry');
    expect(result.leadLevel).toBe('A');
    expect(result.riskLevel).toBe('medium');
  });

  it('classifies product inquiry as B-level', () => {
    const result = classifyByRules('你们的产品有什么功能');
    expect(result.intent).toBe('product_inquiry');
    expect(result.leadLevel).toBe('B');
  });

  it('classifies complaint as C-level with high risk', () => {
    const result = classifyByRules('太差了，投诉你们');
    expect(result.intent).toBe('complaint');
    expect(result.leadLevel).toBe('C');
    expect(result.riskLevel).toBe('high');
    expect(result.nextAction).toBe('require_human_review');
  });

  it('classifies spam as D-level', () => {
    const result = classifyByRules('加我微信吧 vx12345');
    expect(result.intent).toBe('spam');
    expect(result.leadLevel).toBe('D');
    expect(result.nextAction).toBe('ignore');
  });

  it('classifies general chat as C-level', () => {
    const result = classifyByRules('挺好的');
    expect(result.intent).toBe('general_chat');
    expect(result.leadLevel).toBe('C');
    expect(result.confidence).toBe(0.5);
  });

  it('handles empty string as general', () => {
    const result = classifyByRules('');
    expect(result.intent).toBe('general_chat');
    expect(result.leadLevel).toBe('C');
  });
});

describe('generateRuleBasedReply', () => {
  it('generates guide_to_private for price inquiry', () => {
    const classification = classifyByRules('多少钱');
    const reply = generateRuleBasedReply('多少钱', classification, 'xiaohongshu');
    expect(reply.replyType).toBe('guide_to_private');
    expect(reply.needReview).toBe(false);
  });

  it('generates guide_to_wecom for appointment', () => {
    const classification = classifyByRules('可以预约吗');
    const reply = generateRuleBasedReply('可以预约吗', classification, 'douyin');
    expect(reply.replyType).toBe('guide_to_wecom');
  });

  it('generates complaint_response with needReview', () => {
    const classification = classifyByRules('太差了 投诉');
    const reply = generateRuleBasedReply('太差了 投诉', classification, 'douyin');
    expect(reply.replyType).toBe('complaint_response');
    expect(reply.needReview).toBe(true);
  });

  it('generates thanks for general content', () => {
    const classification = classifyByRules('不错');
    const reply = generateRuleBasedReply('不错', classification, 'xiaohongshu');
    expect(reply.replyType).toBe('thanks');
  });
});

describe('containsSensitiveContent', () => {
  it('detects phone numbers', () => {
    expect(containsSensitiveContent('联系我 13812345678')).toBe(true);
  });

  it('detects WeChat IDs', () => {
    expect(containsSensitiveContent('微信号 test1234')).toBe(true);
  });

  it('detects email addresses', () => {
    expect(containsSensitiveContent('test@example.com')).toBe(true);
  });

  it('detects "add my WeChat" patterns', () => {
    expect(containsSensitiveContent('加我微信聊')).toBe(true);
  });

  it('detects URLs', () => {
    expect(containsSensitiveContent('https://example.com')).toBe(true);
  });

  it('returns false for clean content', () => {
    expect(containsSensitiveContent('请问价格多少')).toBe(false);
  });
});
