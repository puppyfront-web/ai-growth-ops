import { describe, it, expect } from 'vitest';

describe('runtime package skeleton', () => {
  it('is importable', async () => {
    const mod = await import('@ai-growth-ops/runtime');
    expect(mod.PACKAGE_NAME).toBe('@ai-growth-ops/runtime');
  });
});
