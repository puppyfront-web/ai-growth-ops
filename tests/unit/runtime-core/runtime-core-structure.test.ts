import { describe, expect, it } from 'vitest';

describe('runtime core workspace structure', () => {
  it('exports capability schema constants', async () => {
    const mod = await import('@ai-growth-ops/capability-schema');
    expect(mod.CAPABILITIES.PUBLISH_VIDEO).toBe('publish.video');
  });

  it('exports runtime command input types', async () => {
    const mod = await import('@ai-growth-ops/shared-types');
    expect(typeof mod.createRuntimeRequest).toBe('function');
  });
});
