import { describe, expect, it } from 'vitest';
import { runSkillLifecycle } from '../../../apps/runtime-core/src/workflows/run-skill-lifecycle';

describe('skill lifecycle graph', () => {
  it('installs and enables a skill manifest', async () => {
    const result = await runSkillLifecycle({
      action: 'install',
      source: 'skills/manifests/example.douyin.publish.json',
    });

    expect(result.status).toBe('success');
    expect(result.skillId).toBe('douyin-upload');
  });
});
