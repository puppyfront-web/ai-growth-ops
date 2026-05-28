import { describe, expect, it } from 'vitest';
import { getOrCreateConnector } from '../../../packages/connectors/src/interaction/registry';

describe('getOrCreateConnector', () => {
  it('does not reuse browser-assist connectors created with different runtime config', () => {
    const first = getOrCreateConnector('douyin', 'browser_assist', {
      mode: 'browser_assist',
      cookie: 'sessionid=first',
      headed: false,
    });
    const second = getOrCreateConnector('douyin', 'browser_assist', {
      mode: 'browser_assist',
      cookie: 'sessionid=second',
      headed: true,
    });

    expect(first).not.toBe(second);
  });
});
