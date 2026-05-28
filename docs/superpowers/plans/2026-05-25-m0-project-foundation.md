# M0 Project Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the stage-1 monorepo skeleton for the AI growth ops system so the workspace can install, lint, test, and expose a shared health-check surface.

**Architecture:** Use a pnpm workspace with lightweight TypeScript packages and app entrypoints that mirror the target architecture without prematurely pulling in heavy runtime frameworks. Centralize shared health types and utility functions in `packages/shared`, keep each app as a small package exporting metadata plus a health-check function, and verify the whole workspace through root lint/test/build scripts and Docker Compose service definitions.

**Tech Stack:** pnpm workspace, TypeScript, Vitest, ESLint, Prettier, tsup, Docker Compose, PostgreSQL, Redis, MinIO

---

### Task 1: Create workspace and shared toolchain

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `tsup.config.ts`
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `.gitignore`
- Create: `vitest.workspace.ts`
- Create: `tests/setup/vitest.setup.ts`
- Create: `tests/unit/workspace.structure.test.ts`

- [ ] **Step 1: Write the failing workspace structure test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/workspace.structure.test.ts`
Expected: FAIL because `packages/shared/src/workspace` does not exist yet.

- [ ] **Step 3: Add root workspace/toolchain config and shared workspace metadata**

Implementation notes:

- Root `package.json` defines `lint`, `test`, `build`, `typecheck`, `dev`, and `format:check`.
- `pnpm-workspace.yaml` includes `apps/*` and `packages/*`.
- `tsconfig.base.json` configures shared strict TypeScript defaults and path aliases.
- `vitest.workspace.ts` runs root tests and package tests.
- `packages/shared/src/workspace.ts` exports the ordered `workspacePackageNames` array.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/workspace.structure.test.ts`
Expected: PASS

### Task 2: Add shared health primitives and app skeletons

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/health.ts`
- Create: `packages/shared/src/workspace.ts`
- Create: `tests/unit/health.contract.test.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/src/index.ts`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/index.ts`
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/index.ts`
- Create: `apps/provider-gateway/package.json`
- Create: `apps/provider-gateway/tsconfig.json`
- Create: `apps/provider-gateway/src/index.ts`
- Create: `apps/browser-runner/package.json`
- Create: `apps/browser-runner/tsconfig.json`
- Create: `apps/browser-runner/src/index.ts`
- Create: `apps/research-runner/package.json`
- Create: `apps/research-runner/tsconfig.json`
- Create: `apps/research-runner/src/index.ts`

- [ ] **Step 1: Write the failing health contract test**

```ts
import { describe, expect, it } from 'vitest';

import { getApiHealth } from '../../apps/api/src';
import { getBrowserRunnerHealth } from '../../apps/browser-runner/src';
import { getProviderGatewayHealth } from '../../apps/provider-gateway/src';
import { getResearchRunnerHealth } from '../../apps/research-runner/src';
import { getWebHealth } from '../../apps/web/src';
import { getWorkerHealth } from '../../apps/worker/src';

describe('stage-1 app health contracts', () => {
  it('returns healthy metadata for every stage-1 app', () => {
    const healthChecks = [
      getWebHealth(),
      getApiHealth(),
      getWorkerHealth(),
      getProviderGatewayHealth(),
      getBrowserRunnerHealth(),
      getResearchRunnerHealth()
    ];

    expect(healthChecks).toHaveLength(6);
    expect(healthChecks.every((item) => item.status === 'ok')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/health.contract.test.ts`
Expected: FAIL because the app entrypoints do not exist yet.

- [ ] **Step 3: Implement shared health types and minimal app entrypoints**

Implementation notes:

- `packages/shared/src/health.ts` defines `HealthStatus`, `AppHealthSnapshot`, and `createHealthSnapshot(name)`.
- Each `apps/*/src/index.ts` exports `appName` plus `get<AppName>Health()`.
- Keep M0 runtime-free; app entrypoints are plain TypeScript modules.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/health.contract.test.ts`
Expected: PASS

### Task 3: Add placeholder domain packages, docs, env template, and Docker Compose

**Files:**

- Create: `packages/database/package.json`
- Create: `packages/database/tsconfig.json`
- Create: `packages/database/src/index.ts`
- Create: `packages/connectors/package.json`
- Create: `packages/connectors/tsconfig.json`
- Create: `packages/connectors/src/index.ts`
- Create: `packages/providers/package.json`
- Create: `packages/providers/tsconfig.json`
- Create: `packages/providers/src/index.ts`
- Create: `packages/skills/package.json`
- Create: `packages/skills/tsconfig.json`
- Create: `packages/skills/src/index.ts`
- Create: `packages/ai/package.json`
- Create: `packages/ai/tsconfig.json`
- Create: `packages/ai/src/index.ts`
- Create: `packages/lead-sinks/package.json`
- Create: `packages/lead-sinks/tsconfig.json`
- Create: `packages/lead-sinks/src/index.ts`
- Create: `packages/observability/package.json`
- Create: `packages/observability/tsconfig.json`
- Create: `packages/observability/src/index.ts`
- Create: `README.md`
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `tests/unit/docker-compose.contract.test.ts`

- [ ] **Step 1: Write the failing Docker Compose contract test**

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('docker compose contract', () => {
  it('defines postgres, redis, and minio services', () => {
    const composeFile = readFileSync('docker-compose.yml', 'utf8');

    expect(composeFile).toContain('postgres:');
    expect(composeFile).toContain('redis:');
    expect(composeFile).toContain('minio:');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/docker-compose.contract.test.ts`
Expected: FAIL because `docker-compose.yml` does not exist yet.

- [ ] **Step 3: Add placeholder domain packages and operational assets**

Implementation notes:

- Every package exports simple `packageMetadata` so the workspace builds cleanly.
- `README.md` documents the M0 scope, scripts, and service startup.
- `.env.example` includes PostgreSQL, Redis, MinIO, and app port placeholders.
- `docker-compose.yml` defines `postgres`, `redis`, and `minio` with persistent volumes and standard ports.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/docker-compose.contract.test.ts`
Expected: PASS

### Task 4: Verify the full M0 foundation

**Files:**

- Verify all files created above

- [ ] **Step 1: Install dependencies**

Run: `pnpm install`
Expected: lockfile generated and workspace install succeeds.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS with no ESLint errors.

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: PASS with all unit tests green.

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: PASS with workspace packages compiling through `tsup`.

- [ ] **Step 5: Validate Docker Compose file**

Run: `docker compose config`
Expected: PASS with a normalized Compose configuration.
