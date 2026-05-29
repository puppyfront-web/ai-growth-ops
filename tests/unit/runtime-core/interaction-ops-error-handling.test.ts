import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInteractionOps } from '../../../apps/runtime-core/src/workflows/run-interaction-ops';

const originalEnv = {
  AI_GROWTH_OPS_DOUYIN_SHARED_ACCOUNT: process.env.AI_GROWTH_OPS_DOUYIN_SHARED_ACCOUNT,
  SOCIAL_PUBLISH_DATA_DIR: process.env.SOCIAL_PUBLISH_DATA_DIR,
  BROWSER_RUNNER_URL: process.env.BROWSER_RUNNER_URL,
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

describe('runInteractionOps error handling', () => {
  it('falls back when browser-runner returns a structured message-fetch error', async () => {
    const tempRoot = join(process.cwd(), '.tmp-tests', `douyin-message-cookie-${Date.now()}`);
    await mkdir(join(tempRoot, 'cookies', 'douyin'), { recursive: true });
    await writeFile(
      join(tempRoot, 'cookies', 'douyin', 'shared.json'),
      JSON.stringify({
        cookies: [{ name: 'sessionid', value: 'shared-session' }],
      }),
      'utf8',
    );

    process.env.AI_GROWTH_OPS_DOUYIN_SHARED_ACCOUNT = 'shared';
    process.env.SOCIAL_PUBLISH_DATA_DIR = tempRoot;
    process.env.BROWSER_RUNNER_URL = 'http://localhost:3200';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Failed to fetch messages',
            errorCode: 'ASSIST_FETCH_MESSAGES_FAILED',
          }),
          {
            status: 502,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    );

    const result = await runInteractionOps({
      platform: 'douyin',
      interactionType: 'messages',
    });

    expect(result.status).toBe('success');
    expect(result.mode).toBe('fallback');
    expect(result.reason).toBe('browser_runner_unavailable');
    expect(result.items).toHaveLength(1);
  });
});
