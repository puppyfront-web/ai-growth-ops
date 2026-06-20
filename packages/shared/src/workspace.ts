export const workspacePackageNames = [
  '@ai-growth-ops/api',
  '@ai-growth-ops/browser-runner',
  '@ai-growth-ops/web',
  '@ai-growth-ops/worker',
  '@ai-growth-ops/ai',
  '@ai-growth-ops/connectors',
  '@ai-growth-ops/database',
  '@ai-growth-ops/lead-sinks',
  '@ai-growth-ops/observability',
  '@ai-growth-ops/providers',
  '@ai-growth-ops/shared',
  '@ai-growth-ops/skills',
  '@ai-growth-ops/runtime'
] as const;

export type WorkspacePackageName = (typeof workspacePackageNames)[number];
