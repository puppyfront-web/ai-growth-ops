import type { WorkingMemory } from '../types.js';

type RunMap = Map<string, unknown>;

export class InProcessWorkingMemory implements WorkingMemory {
  private readonly store = new Map<string, RunMap>();

  private ensure(runId: string): RunMap {
    let m = this.store.get(runId);
    if (!m) { m = new Map(); this.store.set(runId, m); }
    return m;
  }

  async get(runId: string, key: string): Promise<unknown> {
    return this.store.get(runId)?.get(key);
  }

  async set(runId: string, key: string, value: unknown): Promise<void> {
    this.ensure(runId).set(key, value);
  }

  async all(runId: string): Promise<Record<string, unknown>> {
    const m = this.store.get(runId);
    if (!m) return {};
    return Object.fromEntries(m.entries());
  }

  async clear(runId: string): Promise<void> {
    this.store.delete(runId);
  }
}

export function createWorkingMemory(): WorkingMemory {
  return new InProcessWorkingMemory();
}
