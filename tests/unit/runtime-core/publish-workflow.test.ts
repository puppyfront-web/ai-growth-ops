import { describe, expect, it } from 'vitest';
import { runRuntimeRequest } from '../../../apps/runtime-core/src/workflows/run-runtime-request';

describe('publish workflow', () => {
  it('routes a publish intent and resolves a publish skill', async () => {
    const result = await runRuntimeRequest({
      requestId: 'req-1',
      intent: 'publish',
      payload: {
        platforms: ['douyin'],
        title: 'AI Native Demo',
        content: 'hello',
        mediaFilePaths: ['/tmp/demo.mp4'],
      },
    });

    expect(result.workflow).toBe('publish');
    expect(result.status).toBe('success');
    expect(result.results[0].platform).toBe('douyin');
  });
});
