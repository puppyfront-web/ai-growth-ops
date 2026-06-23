import { describe, it, expect } from 'vitest';
import { EnvCredentialResolver } from '@ai-growth-ops/runtime-mcp';

describe('EnvCredentialResolver', () => {
  it('reads cookie from AI_GROWTH_OPS_<PLATFORM>_COOKIE, uppercased', async () => {
    const env = { AI_GROWTH_OPS_DOUYIN_COOKIE: 'cookie-abc' };
    const r = new EnvCredentialResolver(env);
    await expect(r.getCookie('u', 'o', 'douyin')).resolves.toBe('cookie-abc');
    await expect(r.getCookie('u', 'o', 'xiaohongshu')).resolves.toBeUndefined();
  });
});
