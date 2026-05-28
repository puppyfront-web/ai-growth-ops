import { describe, expect, it } from 'vitest';

import { workspacePackageNames } from '../../packages/shared/src/workspace';

describe('workspace package structure', () => {
  it('declares the stage-1 app and package names', () => {
    expect(workspacePackageNames).toEqual([
      '@ai-growth-ops/api',
      '@ai-growth-ops/browser-runner',
      '@ai-growth-ops/provider-gateway',
      '@ai-growth-ops/research-runner',
      '@ai-growth-ops/web',
      '@ai-growth-ops/worker',
      '@ai-growth-ops/ai',
      '@ai-growth-ops/connectors',
      '@ai-growth-ops/database',
      '@ai-growth-ops/lead-sinks',
      '@ai-growth-ops/observability',
      '@ai-growth-ops/providers',
      '@ai-growth-ops/shared',
      '@ai-growth-ops/skills'
    ]);
  });
});
