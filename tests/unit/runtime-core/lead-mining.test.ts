import { describe, expect, it } from 'vitest';
import { runLeadMining } from '../../../apps/runtime-core/src/workflows/run-lead-mining';

describe('lead mining workflow', () => {
  it('converts high-intent interactions into leads', async () => {
    const result = await runLeadMining({
      candidates: [{ platform: 'douyin', content: '怎么合作？', confidence: 0.95 }],
    });

    expect(result.status).toBe('success');
    expect(result.leads[0].level).toBe('A');
  });
});
