import { describe, it, expect } from 'vitest';
import { createWorkingMemory } from '@ai-growth-ops/runtime';

describe('InProcessWorkingMemory', () => {
  it('sets and gets per-run keys', async () => {
    const mem = createWorkingMemory();
    await mem.set('run-1', 'topic', 'douyin summer promo');
    expect(await mem.get('run-1', 'topic')).toBe('douyin summer promo');
  });

  it('isolates keys across runs', async () => {
    const mem = createWorkingMemory();
    await mem.set('run-1', 'topic', 'a');
    await mem.set('run-2', 'topic', 'b');
    expect(await mem.get('run-1', 'topic')).toBe('a');
    expect(await mem.get('run-2', 'topic')).toBe('b');
  });

  it('returns undefined for missing keys', async () => {
    const mem = createWorkingMemory();
    expect(await mem.get('run-1', 'nope')).toBeUndefined();
  });

  it('snapshots all keys for a run', async () => {
    const mem = createWorkingMemory();
    await mem.set('run-1', 'a', 1);
    await mem.set('run-1', 'b', 2);
    expect(await mem.all('run-1')).toEqual({ a: 1, b: 2 });
  });

  it('clears a run', async () => {
    const mem = createWorkingMemory();
    await mem.set('run-1', 'a', 1);
    await mem.clear('run-1');
    expect(await mem.all('run-1')).toEqual({});
  });
});
