import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInteractionOps } from '../../../apps/runtime-core/src/workflows/run-interaction-ops';
import { XiaohongshuConnector } from '../../../packages/connectors/src/interaction/xiaohongshu-connector';

const originalEnv = {
  AI_GROWTH_OPS_XIAOHONGSHU_SHARED_ACCOUNT:
    process.env.AI_GROWTH_OPS_XIAOHONGSHU_SHARED_ACCOUNT,
  SOCIAL_PUBLISH_DATA_DIR: process.env.SOCIAL_PUBLISH_DATA_DIR,
  BROWSER_RUNNER_URL: process.env.BROWSER_RUNNER_URL
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('interaction ops workflow', () => {
  it('fetches comments and produces reply suggestions', async () => {
    const tempRoot = join(
      process.cwd(),
      '.tmp-tests',
      `xhs-comments-${Date.now()}`
    );
    await mkdir(join(tempRoot, 'cookies', 'xiaohongshu'), { recursive: true });
    await writeFile(
      join(tempRoot, 'cookies', 'xiaohongshu', 'shared.json'),
      JSON.stringify({
        cookies: [{ name: 'web_session', value: 'xhs-session' }]
      }),
      'utf8'
    );

    process.env.AI_GROWTH_OPS_XIAOHONGSHU_SHARED_ACCOUNT = 'shared';
    process.env.SOCIAL_PUBLISH_DATA_DIR = tempRoot;
    process.env.BROWSER_RUNNER_URL = 'http://localhost:3200';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            { content: 'Great post!', userNickname: 'user1' },
            { content: 'Love it!', userNickname: 'user2' }
          ]),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      )
    );

    const result = await runInteractionOps({
      platform: 'xiaohongshu',
      interactionType: 'comments'
    });

    expect(result.status).toBe('success');
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('reports xiaohongshu message fetching as limited support', async () => {
    const connector = new XiaohongshuConnector({ mode: 'browser_assist' });
    await expect(connector.getCapabilities()).resolves.toMatchObject({
      fetchMessages: 'limited'
    });
  });
});
