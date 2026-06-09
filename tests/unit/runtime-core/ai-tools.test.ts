import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the ai-tools module itself — test the classification/reply functions
// at the unit level by replacing the skill runner dependency.
const mockRunClassification = vi.fn();
const mockRunReplySuggestion = vi.fn();

vi.mock('../../../apps/runtime-core/src/tools/ai-tools.js', () => ({
  getSkillRunner: vi.fn(),
  resetSkillRunner: vi.fn(),
  runClassification: (...args: unknown[]) => mockRunClassification(...args),
  runReplySuggestion: (...args: unknown[]) => mockRunReplySuggestion(...args)
}));

import { runLeadMining } from '../../../apps/runtime-core/src/workflows/run-lead-mining.js';
import type { LeadCandidate } from '../../../apps/runtime-core/src/graphs/lead-mining-graph.js';

function makeCandidate(overrides: Partial<LeadCandidate> = {}): LeadCandidate {
  return {
    platform: 'xiaohongshu',
    interactionType: 'comment',
    content: '请问这个多少钱',
    ...overrides
  };
}

beforeEach(() => {
  mockRunClassification.mockReset();
  mockRunReplySuggestion.mockReset();
});

describe('runLeadMining pipeline', () => {
  it('classifies candidates and returns structured result', async () => {
    // Simulate rule-based fallback for all candidates
    mockRunClassification
      .mockResolvedValueOnce({
        result: {
          intent: 'price_inquiry',
          leadLevel: 'A',
          confidence: 0.88,
          riskLevel: 'low',
          summary: '用户咨询价格',
          tags: ['价格咨询'],
          nextAction: 'suggest_reply'
        },
        source: 'rules'
      })
      .mockResolvedValueOnce({
        result: {
          intent: 'general_chat',
          leadLevel: 'C',
          confidence: 0.5,
          riskLevel: 'low',
          summary: '一般互动',
          tags: [],
          nextAction: 'suggest_reply'
        },
        source: 'rules'
      })
      .mockResolvedValueOnce({
        result: {
          intent: 'spam',
          leadLevel: 'D',
          confidence: 0.9,
          riskLevel: 'medium',
          summary: '疑似推广',
          tags: ['垃圾'],
          nextAction: 'ignore'
        },
        source: 'rules'
      });

    mockRunReplySuggestion
      .mockResolvedValueOnce({
        result: {
          suggestedText: '您好，具体价格...',
          replyType: 'guide_to_private',
          riskLevel: 'low',
          needReview: false
        },
        source: 'rules'
      })
      .mockResolvedValueOnce({
        result: {
          suggestedText: '感谢关注',
          replyType: 'thanks',
          riskLevel: 'low',
          needReview: false
        },
        source: 'rules'
      });

    const candidates = [
      makeCandidate({ content: '请问这个多少钱' }),
      makeCandidate({ content: '挺好的，关注了' }),
      makeCandidate({ content: '加我微信 abc12345' })
    ];

    const result = await runLeadMining({ candidates });

    expect(result.status).toBe('success');
    expect(result.totalCandidates).toBe(3);
    expect(result.classified).toBe(3);
    expect(result.leads).toHaveLength(3);

    expect(result.leads[0].classification.leadLevel).toBe('A');
    expect(result.leads[0].classification.intent).toBe('price_inquiry');
    expect(result.leads[0].classificationSource).toBe('rules');
    expect(result.leads[0].replySuggestion).toBeDefined();

    expect(result.leads[1].classification.leadLevel).toBe('C');

    expect(result.leads[2].classification.leadLevel).toBe('D');
    expect(result.leads[2].replySuggestion).toBeUndefined();
  });

  it('D-level leads get no reply suggestion', async () => {
    mockRunClassification.mockResolvedValueOnce({
      result: {
        intent: 'spam',
        leadLevel: 'D',
        confidence: 0.9,
        riskLevel: 'medium',
        summary: 'spam',
        tags: [],
        nextAction: 'ignore'
      },
      source: 'rules'
    });

    const result = await runLeadMining({
      candidates: [makeCandidate({ content: '加我微信' })]
    });

    expect(result.leads[0].classification.leadLevel).toBe('D');
    expect(result.leads[0].replySuggestion).toBeUndefined();
    expect(mockRunReplySuggestion).not.toHaveBeenCalled();
  });

  it('non-D leads get reply suggestions', async () => {
    mockRunClassification.mockResolvedValueOnce({
      result: {
        intent: 'price_inquiry',
        leadLevel: 'A',
        confidence: 0.9,
        riskLevel: 'low',
        summary: 'Price',
        tags: [],
        nextAction: 'suggest_reply'
      },
      source: 'llm'
    });
    mockRunReplySuggestion.mockResolvedValueOnce({
      result: {
        suggestedText: '您好，感谢咨询',
        replyType: 'guide_to_private',
        riskLevel: 'low',
        needReview: false
      },
      source: 'llm'
    });

    const result = await runLeadMining({
      candidates: [makeCandidate({ content: '多少钱' })]
    });

    expect(result.leads[0].classification.leadLevel).toBe('A');
    expect(result.leads[0].classificationSource).toBe('llm');
    expect(result.leads[0].replySuggestion).toBeDefined();
    expect(result.leads[0].replySuggestion!.suggestedText).toBe(
      '您好，感谢咨询'
    );
    expect(result.leads[0].replySource).toBe('llm');
  });

  it('computes correct level breakdown', async () => {
    const levels: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
    for (const level of levels) {
      mockRunClassification.mockResolvedValueOnce({
        result: {
          intent: 'test',
          leadLevel: level,
          confidence: 0.5,
          riskLevel: 'low',
          summary: '',
          tags: [],
          nextAction: 'suggest_reply'
        },
        source: 'rules'
      });
    }
    // Non-D leads get reply
    mockRunReplySuggestion.mockResolvedValue({
      result: {
        suggestedText: 'ok',
        replyType: 'thanks',
        riskLevel: 'low',
        needReview: false
      },
      source: 'rules'
    });

    const result = await runLeadMining({
      candidates: levels.map((_, i) => makeCandidate({ content: `test ${i}` }))
    });

    expect(result.levelBreakdown).toEqual({ A: 1, B: 1, C: 1, D: 1 });
  });

  it('returns failed when no candidates', async () => {
    const result = await runLeadMining({ candidates: [] });

    expect(result.status).toBe('failed');
    expect(result.totalCandidates).toBe(0);
    expect(result.leads).toHaveLength(0);
  });

  it('preserves original content and metadata', async () => {
    mockRunClassification.mockResolvedValueOnce({
      result: {
        intent: 'test',
        leadLevel: 'A',
        confidence: 0.9,
        riskLevel: 'low',
        summary: 'test',
        tags: [],
        nextAction: 'suggest_reply'
      },
      source: 'rules'
    });
    mockRunReplySuggestion.mockResolvedValueOnce(null);

    const result = await runLeadMining({
      candidates: [
        makeCandidate({
          content: '合作事宜',
          platform: 'douyin',
          interactionType: 'message',
          userNickname: 'test_user'
        })
      ]
    });

    expect(result.leads[0].originalContent).toBe('合作事宜');
    expect(result.leads[0].platform).toBe('douyin');
    expect(result.leads[0].interactionType).toBe('message');
    expect(result.leads[0].userNickname).toBe('test_user');
  });
});
