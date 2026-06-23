import type { SupervisorState } from '@ai-growth-ops/runtime';
import type { RunStore } from './types.js';

/** In-memory RunStore; one MCP server process per host session. Production swaps to Redis. */
export class InMemoryRunStore implements RunStore {
  private runs = new Map<string, SupervisorState>();
  async get(runId: string): Promise<SupervisorState | undefined> {
    return this.runs.get(runId);
  }
  async set(runId: string, state: SupervisorState): Promise<void> {
    this.runs.set(runId, state);
  }
}
