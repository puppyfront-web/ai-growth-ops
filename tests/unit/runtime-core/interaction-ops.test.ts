import { describe, expect, it } from 'vitest';
import { runInteractionOps } from '../../../apps/runtime-core/src/workflows/run-interaction-ops';
import { XiaohongshuConnector } from '../../../packages/connectors/src/interaction/xiaohongshu-connector';

describe('interaction ops workflow', () => {
  it('fetches comments and produces reply suggestions', async () => {
    const result = await runInteractionOps({
      platform: 'xiaohongshu',
      interactionType: 'comments'
    });

    expect(result.status).toBe('success');
    expect(result.replySuggestions.length).toBeGreaterThan(0);
  });

  it('reports xiaohongshu message fetching as limited support', async () => {
    const connector = new XiaohongshuConnector({ mode: 'browser_assist' });
    await expect(connector.getCapabilities()).resolves.toMatchObject({
      fetchMessages: 'limited'
    });
  });
});
