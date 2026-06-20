import { describe, it, expect } from 'vitest';
// handler is tested by injecting a fake supervisor factory; see implementation note in brief.
// Minimal smoke: module loads and exports handleAgentRun.
// Full-loop (DB + Redis) coverage lives in the Task 11 E2E suite.
describe('agent.run handler', () => {
  it('exports handleAgentRun', async () => {
    // Three `../` to reach repo root from tests/unit/worker/ (matches
    // interaction-sync-utils.test.ts convention). No `.js` suffix: Vite's
    // dynamic-import `.js`→`.ts` rewrite does not fire for dotted filenames.
    const mod = await import(
      '../../../apps/worker/src/job-handlers/agent.run'
    );
    expect(typeof mod.handleAgentRun).toBe('function');
  });
});
