import { describe, expect, it, vi } from 'vitest';

// Mock ai-tools to prevent real LLM client initialization
const mockRunClassification = vi.fn();
const mockRunReplySuggestion = vi.fn();

vi.mock('../../../apps/runtime-core/src/tools/ai-tools.js', () => ({
  getSkillRunner: vi.fn(),
  resetSkillRunner: vi.fn(),
  runClassification: (...args: unknown[]) => mockRunClassification(...args),
  runReplySuggestion: (...args: unknown[]) => mockRunReplySuggestion(...args),
}));

import { runLeadMining } from '../../../apps/runtime-core/src/workflows/run-lead-mining';

describe('lead mining workflow', () => {
  it('converts high-intent interactions into leads', async () => {
    mockRunClassification.mockResolvedValueOnce({
      result: {
        intent: 'cooperation_inquiry',
        leadLevel: 'A',
        confidence: 0.85,
        riskLevel: 'medium',
        summary: '用户咨询合作事宜',
        tags: ['合作', '商务'],
        nextAction: 'notify_sales',
      },
      source: 'rules',
    });
    mockRunReplySuggestion.mockResolvedValueOnce({
      result: {
        suggestedText: '您好，感谢关注！关于合作事宜...',
        replyType: 'guide_to_private',
        riskLevel: 'medium',
        needReview: true,
      },
      source: 'rules',
    });

    const result = await runLeadMining({
      candidates: [{ platform: 'douyin', interactionType: 'comment', content: '怎么合作？' }],
    });

    expect(result.status).toBe('success');
    expect(result.leads[0].classification.leadLevel).toBe('A');
    expect(result.leads[0].classification.intent).toBe('cooperation_inquiry');
    expect(result.classified).toBe(1);
  });
});
