import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '../../../apps/runtime-core/src/registry/capability-registry';

describe('CapabilityRegistry', () => {
  it('resolves an enabled healthy skill by capability and platform', async () => {
    const registry = new CapabilityRegistry([
      {
        skillId: 'douyin-upload',
        enabled: true,
        healthy: true,
        capabilities: ['publish.video'],
        contexts: [{ platform: 'douyin' }],
        runtime: 'openclaw',
        entrypoint: 'skills/douyin-upload/SKILL.md',
      },
    ]);

    const result = registry.resolve('publish.video', { platform: 'douyin' });
    expect(result?.skillId).toBe('douyin-upload');
  });
});
