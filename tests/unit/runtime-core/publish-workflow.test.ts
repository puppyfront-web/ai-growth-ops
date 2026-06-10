import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runRuntimeRequest } from '../../../apps/runtime-core/src/workflows/run-runtime-request';

const originalEnv = {
  AI_GROWTH_OPS_SOCIAL_PUBLISH_ROOT:
    process.env.AI_GROWTH_OPS_SOCIAL_PUBLISH_ROOT,
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

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({
    status: 0,
    stdout: 'published successfully',
    stderr: ''
  })
}));

describe('publish workflow', () => {
  it('routes a publish intent and resolves a publish skill', async () => {
    process.env.BROWSER_RUNNER_URL = 'http://localhost:3200';

    // Mock fetch to prevent real HTTP requests
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
    );

    const result = await runRuntimeRequest({
      requestId: 'req-1',
      intent: 'publish',
      payload: {
        platforms: ['douyin'],
        title: 'AI Native Demo',
        content: 'hello',
        mediaFilePaths: ['/tmp/demo.mp4']
      }
    });

    expect(result.workflow).toBe('publish');
    expect(result.status).toBe('success');
    expect(result.results[0].platform).toBe('douyin');
  });
});
