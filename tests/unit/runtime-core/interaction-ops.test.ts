import { describe, expect, it } from 'vitest';
import { runInteractionOps } from '../../../apps/runtime-core/src/workflows/run-interaction-ops';

describe('interaction ops workflow', () => {
  it('fetches comments and produces reply suggestions', async () => {
    const result = await runInteractionOps({
      platform: 'xiaohongshu',
      interactionType: 'comments',
    });

    expect(result.status).toBe('success');
    expect(result.replySuggestions.length).toBeGreaterThan(0);
  });
});
