import { describe, it, expect } from 'vitest';
import { InMemoryWorkingMemory, StaticPreferencesStore } from '@ai-growth-ops/runtime-mcp';

describe('InMemoryWorkingMemory', () => {
  it('stores and reads values scoped by runId+key, and snapshots all', async () => {
    const mem = new InMemoryWorkingMemory();
    await mem.set('r1', 'k', { a: 1 });
    await expect(mem.get('r1', 'k')).resolves.toEqual({ a: 1 });
    await expect(mem.get('r1', 'missing')).resolves.toBeUndefined();
    await expect(mem.all('r1')).resolves.toEqual({ k: { a: 1 } });
    await mem.clear('r1');
    await expect(mem.all('r1')).resolves.toEqual({});
  });
});

describe('StaticPreferencesStore', () => {
  it('returns the seeded prefs sliced by domain', async () => {
    const store = new StaticPreferencesStore({
      preferredPlatforms: ['douyin'],
      brandVoice: 'friendly',
      avoidTopics: ['politics'],
      replyStylePreferences: 'concise'
    } as any);
    const content = await store.forDomain('u', 'content');
    expect(content.brandVoice).toBe('friendly');
    expect(content.avoidTopics).toEqual(['politics']);
    expect(content).not.toHaveProperty('replyStylePreferences');
  });
});
