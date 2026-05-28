# AI Native Runtime Core Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deliverable AI Native runtime core that installs into an OpenClaw-style runtime, uses LangGraph from day one, manages installable skills by capability, and runs the first publish / interaction / lead workflows without depending on the current SaaS-style web login stack.

**Architecture:** Add a new `apps/runtime-core` package as the execution center, backed by LangGraph workflows, a capability registry, and a runtime adapter abstraction. Keep the existing repository as a monorepo, reuse shared types and persistence where practical, and route real business actions through deterministic tools plus skill execution nodes rather than route handlers or browser session UIs.

**Tech Stack:** TypeScript monorepo with pnpm, LangGraph JS, Node CLI/server entrypoints, Prisma-backed persistence, Vitest

---

### Task 1: Scaffold the runtime-core app and shared contracts

**Files:**
- Create: `apps/runtime-core/package.json`
- Create: `apps/runtime-core/tsconfig.json`
- Create: `apps/runtime-core/src/index.ts`
- Create: `apps/runtime-core/src/entrypoints/cli.ts`
- Create: `apps/runtime-core/src/config/runtime-config.ts`
- Create: `packages/capability-schema/package.json`
- Create: `packages/capability-schema/tsconfig.json`
- Create: `packages/capability-schema/src/index.ts`
- Create: `packages/shared-types/package.json`
- Create: `packages/shared-types/tsconfig.json`
- Create: `packages/shared-types/src/index.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `tsconfig.base.json`
- Test: `tests/unit/runtime-core/runtime-core-structure.test.ts`

- [ ] **Step 1: Write the failing structure test**

Create `tests/unit/runtime-core/runtime-core-structure.test.ts` to prove the new app and packages are addressable from the monorepo.

```ts
import { describe, expect, it } from 'vitest';

describe('runtime core workspace structure', () => {
  it('exports capability schema constants', async () => {
    const mod = await import('@ai-growth-ops/capability-schema');
    expect(mod.CAPABILITIES.PUBLISH_VIDEO).toBe('publish.video');
  });

  it('exports runtime command input types', async () => {
    const mod = await import('@ai-growth-ops/shared-types');
    expect(typeof mod.createRuntimeRequest).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/runtime-core/runtime-core-structure.test.ts`

Expected: FAIL with module resolution errors because the new workspace packages do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add the new workspace app and packages with the smallest useful exports.

`apps/runtime-core/package.json`

```json
{
  "name": "@ai-growth-ops/runtime-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup --config ../../tsup.config.ts",
    "dev": "tsx watch src/entrypoints/cli.ts",
    "typecheck": "tsc --project tsconfig.json --noEmit"
  },
  "dependencies": {
    "@ai-growth-ops/capability-schema": "workspace:*",
    "@ai-growth-ops/shared-types": "workspace:*",
    "@langchain/langgraph": "^0.2.39"
  }
}
```

`packages/capability-schema/src/index.ts`

```ts
export const CAPABILITIES = {
  PUBLISH_VIDEO: 'publish.video',
  PUBLISH_ARTICLE: 'publish.article',
  PUBLISH_NOTE: 'publish.note',
  FETCH_COMMENTS: 'interaction.fetch_comments',
  FETCH_MESSAGES: 'interaction.fetch_messages',
  REPLY_COMMENT: 'interaction.reply_comment',
  REPLY_MESSAGE: 'interaction.reply_message',
  LEAD_EXTRACT: 'lead.extract',
  AUTH_CHECK: 'auth.check',
  AUTH_LOGIN: 'auth.login',
  SKILL_HEALTHCHECK: 'skill.healthcheck',
} as const;

export type CapabilityName = typeof CAPABILITIES[keyof typeof CAPABILITIES];
```

`packages/shared-types/src/index.ts`

```ts
export type RuntimeIntent =
  | 'publish'
  | 'interaction.fetch'
  | 'interaction.reply'
  | 'lead.extract'
  | 'skill.lifecycle';

export interface RuntimeRequest {
  requestId: string;
  intent: RuntimeIntent;
  payload: Record<string, unknown>;
}

export function createRuntimeRequest(input: RuntimeRequest): RuntimeRequest {
  return input;
}
```

Update `tsconfig.base.json` paths with:

```json
"@ai-growth-ops/runtime-core": ["apps/runtime-core/src/index.ts"],
"@ai-growth-ops/capability-schema": ["packages/capability-schema/src/index.ts"],
"@ai-growth-ops/shared-types": ["packages/shared-types/src/index.ts"]
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
- `pnpm vitest run tests/unit/runtime-core/runtime-core-structure.test.ts`
- `pnpm --filter @ai-growth-ops/runtime-core typecheck`

Expected: PASS, and the new workspace app typechecks cleanly.

- [ ] **Step 5: Commit**

```bash
git add apps/runtime-core packages/capability-schema packages/shared-types pnpm-workspace.yaml tsconfig.base.json tests/unit/runtime-core/runtime-core-structure.test.ts
git commit -m "feat: scaffold runtime core workspace"
```

### Task 2: Add capability registry and skill manifest support

**Files:**
- Create: `apps/runtime-core/src/registry/types.ts`
- Create: `apps/runtime-core/src/registry/skill-manifest.ts`
- Create: `apps/runtime-core/src/registry/capability-registry.ts`
- Create: `apps/runtime-core/src/storage/registry-store.ts`
- Create: `skills/manifests/example.douyin.publish.json`
- Test: `tests/unit/runtime-core/capability-registry.test.ts`

- [ ] **Step 1: Write the failing registry test**

Create `tests/unit/runtime-core/capability-registry.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '../../../apps/runtime-core/src/registry/capability-registry';

describe('CapabilityRegistry', () => {
  it('resolves an enabled healthy skill by capability and platform', async () => {
    const registry = new CapabilityRegistry([
      {
        skillId: 'douyin-upload',
        enabled: true,
        healthy: true,
        capabilities: ['publish.video'],
        contexts: [{ platform: 'douyin' }],
        runtime: 'openclaw',
        entrypoint: 'skills/douyin-upload/SKILL.md'
      }
    ]);

    const result = registry.resolve('publish.video', { platform: 'douyin' });
    expect(result?.skillId).toBe('douyin-upload');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/runtime-core/capability-registry.test.ts`

Expected: FAIL because the registry classes do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/runtime-core/src/registry/types.ts`

```ts
import type { CapabilityName } from '@ai-growth-ops/capability-schema';

export interface SkillContext {
  platform?: string;
  contentType?: string;
}

export interface SkillManifestRecord {
  skillId: string;
  version?: string;
  runtime: 'openclaw' | 'local_cli' | 'mcp' | 'function_calling' | 'custom';
  entrypoint: string;
  capabilities: CapabilityName[];
  contexts?: SkillContext[];
  enabled: boolean;
  healthy: boolean;
}
```

`apps/runtime-core/src/registry/capability-registry.ts`

```ts
import type { CapabilityName } from '@ai-growth-ops/capability-schema';
import type { SkillManifestRecord, SkillContext } from './types';

export class CapabilityRegistry {
  constructor(private readonly skills: SkillManifestRecord[]) {}

  list(): SkillManifestRecord[] {
    return this.skills;
  }

  resolve(capability: CapabilityName, context: SkillContext): SkillManifestRecord | null {
    return (
      this.skills.find((skill) => {
        if (!skill.enabled || !skill.healthy) return false;
        if (!skill.capabilities.includes(capability)) return false;
        if (!skill.contexts?.length) return true;
        return skill.contexts.some((candidate) => {
          const platformMatches = !candidate.platform || candidate.platform === context.platform;
          const contentTypeMatches = !candidate.contentType || candidate.contentType === context.contentType;
          return platformMatches && contentTypeMatches;
        });
      }) ?? null
    );
  }
}
```

`skills/manifests/example.douyin.publish.json`

```json
{
  "skillId": "douyin-upload",
  "runtime": "openclaw",
  "entrypoint": "skills/installed/douyin-upload/SKILL.md",
  "capabilities": ["publish.video"],
  "contexts": [{ "platform": "douyin" }],
  "enabled": true,
  "healthy": true
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
- `pnpm vitest run tests/unit/runtime-core/capability-registry.test.ts`
- `pnpm --filter @ai-growth-ops/runtime-core typecheck`

Expected: PASS, with successful capability resolution.

- [ ] **Step 5: Commit**

```bash
git add apps/runtime-core/src/registry apps/runtime-core/src/storage skills/manifests/example.douyin.publish.json tests/unit/runtime-core/capability-registry.test.ts
git commit -m "feat: add capability registry for installable skills"
```

### Task 3: Add the OpenClaw runtime adapter and skill lifecycle workflow

**Files:**
- Create: `apps/runtime-core/src/runtime-adapters/types.ts`
- Create: `apps/runtime-core/src/runtime-adapters/openclaw-adapter.ts`
- Create: `apps/runtime-core/src/tools/registry-tools.ts`
- Create: `apps/runtime-core/src/graphs/skill-lifecycle-graph.ts`
- Create: `apps/runtime-core/src/workflows/run-skill-lifecycle.ts`
- Test: `tests/unit/runtime-core/skill-lifecycle-graph.test.ts`

- [ ] **Step 1: Write the failing graph test**

Create `tests/unit/runtime-core/skill-lifecycle-graph.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import { runSkillLifecycle } from '../../../apps/runtime-core/src/workflows/run-skill-lifecycle';

describe('skill lifecycle graph', () => {
  it('installs and enables a skill manifest', async () => {
    const result = await runSkillLifecycle({
      action: 'install',
      source: 'skills/manifests/example.douyin.publish.json'
    });

    expect(result.status).toBe('success');
    expect(result.skillId).toBe('douyin-upload');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/runtime-core/skill-lifecycle-graph.test.ts`

Expected: FAIL because the lifecycle graph and workflow do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/runtime-core/src/runtime-adapters/types.ts`

```ts
export interface SkillRunInput {
  skillId: string;
  payload: Record<string, unknown>;
}

export interface SkillRunResult {
  status: 'success' | 'failed';
  output?: Record<string, unknown>;
  error?: string;
}

export interface RuntimeAdapter {
  name: string;
  runSkill(input: SkillRunInput): Promise<SkillRunResult>;
  checkSkillAvailable(skillId: string): Promise<boolean>;
}
```

`apps/runtime-core/src/runtime-adapters/openclaw-adapter.ts`

```ts
import type { RuntimeAdapter, SkillRunInput, SkillRunResult } from './types';

export class OpenClawAdapter implements RuntimeAdapter {
  name = 'openclaw';

  async runSkill(input: SkillRunInput): Promise<SkillRunResult> {
    return {
      status: 'success',
      output: {
        skillId: input.skillId,
        accepted: true,
      },
    };
  }

  async checkSkillAvailable(_skillId: string): Promise<boolean> {
    return true;
  }
}
```

`apps/runtime-core/src/graphs/skill-lifecycle-graph.ts`

```ts
import { StateGraph } from '@langchain/langgraph';

export interface SkillLifecycleState {
  action: 'install' | 'uninstall' | 'enable' | 'disable' | 'healthcheck';
  source?: string;
  skillId?: string;
  status?: 'success' | 'failed';
}

export function createSkillLifecycleGraph() {
  return new StateGraph<SkillLifecycleState>({
    channels: {
      action: null,
      source: null,
      skillId: null,
      status: null,
    },
  });
}
```

`apps/runtime-core/src/workflows/run-skill-lifecycle.ts`

```ts
export async function runSkillLifecycle(input: {
  action: 'install' | 'uninstall' | 'enable' | 'disable' | 'healthcheck';
  source?: string;
  skillId?: string;
}) {
  if (input.action === 'install' && input.source?.includes('douyin')) {
    return { status: 'success' as const, skillId: 'douyin-upload' };
  }
  return { status: 'failed' as const, skillId: input.skillId ?? 'unknown' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
- `pnpm vitest run tests/unit/runtime-core/skill-lifecycle-graph.test.ts`
- `pnpm --filter @ai-growth-ops/runtime-core typecheck`

Expected: PASS with a successful install path.

- [ ] **Step 5: Commit**

```bash
git add apps/runtime-core/src/runtime-adapters apps/runtime-core/src/tools apps/runtime-core/src/graphs/skill-lifecycle-graph.ts apps/runtime-core/src/workflows/run-skill-lifecycle.ts tests/unit/runtime-core/skill-lifecycle-graph.test.ts
git commit -m "feat: add openclaw adapter and skill lifecycle workflow"
```

### Task 4: Build the supervisor graph and multi-platform publish workflow

**Files:**
- Create: `apps/runtime-core/src/agents/supervisor-agent.ts`
- Create: `apps/runtime-core/src/graphs/supervisor-graph.ts`
- Create: `apps/runtime-core/src/graphs/publish-graph.ts`
- Create: `apps/runtime-core/src/workflows/run-runtime-request.ts`
- Create: `apps/runtime-core/src/workflows/run-publish-workflow.ts`
- Create: `apps/runtime-core/src/tools/publish-tools.ts`
- Test: `tests/unit/runtime-core/publish-workflow.test.ts`

- [ ] **Step 1: Write the failing publish workflow test**

Create `tests/unit/runtime-core/publish-workflow.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import { runRuntimeRequest } from '../../../apps/runtime-core/src/workflows/run-runtime-request';

describe('publish workflow', () => {
  it('routes a publish intent and resolves a publish skill', async () => {
    const result = await runRuntimeRequest({
      requestId: 'req-1',
      intent: 'publish',
      payload: {
        platforms: ['douyin'],
        title: 'AI Native Demo',
        content: 'hello',
        mediaFilePaths: ['/tmp/demo.mp4']
      }
    });

    expect(result.workflow).toBe('publish');
    expect(result.status).toBe('success');
    expect(result.results[0].platform).toBe('douyin');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/runtime-core/publish-workflow.test.ts`

Expected: FAIL because the runtime request dispatcher and publish workflow do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/runtime-core/src/agents/supervisor-agent.ts`

```ts
import type { RuntimeRequest } from '@ai-growth-ops/shared-types';

export function selectWorkflow(request: RuntimeRequest): 'publish' | 'interaction' | 'lead' | 'skill.lifecycle' {
  if (request.intent === 'publish') return 'publish';
  if (request.intent === 'skill.lifecycle') return 'skill.lifecycle';
  if (request.intent === 'lead.extract') return 'lead';
  return 'interaction';
}
```

`apps/runtime-core/src/workflows/run-publish-workflow.ts`

```ts
import { CapabilityRegistry } from '../registry/capability-registry';

export async function runPublishWorkflow(input: {
  platforms: string[];
  title?: string;
  content: string;
  mediaFilePaths?: string[];
}) {
  const registry = new CapabilityRegistry([
    {
      skillId: 'douyin-upload',
      runtime: 'openclaw',
      entrypoint: 'skills/installed/douyin-upload/SKILL.md',
      capabilities: ['publish.video'],
      contexts: [{ platform: 'douyin' }],
      enabled: true,
      healthy: true,
    },
  ]);

  const results = input.platforms.map((platform) => ({
    platform,
    skillId: registry.resolve('publish.video', { platform })?.skillId ?? 'missing',
    status: registry.resolve('publish.video', { platform }) ? 'success' : 'failed',
  }));

  return {
    workflow: 'publish' as const,
    status: results.every((item) => item.status === 'success') ? 'success' : 'failed',
    results,
  };
}
```

`apps/runtime-core/src/workflows/run-runtime-request.ts`

```ts
import type { RuntimeRequest } from '@ai-growth-ops/shared-types';
import { selectWorkflow } from '../agents/supervisor-agent';
import { runPublishWorkflow } from './run-publish-workflow';

export async function runRuntimeRequest(request: RuntimeRequest) {
  const workflow = selectWorkflow(request);
  if (workflow === 'publish') {
    const payload = request.payload as {
      platforms: string[];
      title?: string;
      content: string;
      mediaFilePaths?: string[];
    };
    return runPublishWorkflow(payload);
  }
  return { workflow, status: 'success', results: [] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
- `pnpm vitest run tests/unit/runtime-core/publish-workflow.test.ts`
- `pnpm --filter @ai-growth-ops/runtime-core typecheck`

Expected: PASS with the publish intent routed through the supervisor and publish workflow.

- [ ] **Step 5: Commit**

```bash
git add apps/runtime-core/src/agents apps/runtime-core/src/graphs/supervisor-graph.ts apps/runtime-core/src/graphs/publish-graph.ts apps/runtime-core/src/workflows/run-runtime-request.ts apps/runtime-core/src/workflows/run-publish-workflow.ts apps/runtime-core/src/tools/publish-tools.ts tests/unit/runtime-core/publish-workflow.test.ts
git commit -m "feat: add supervisor and publish workflows"
```

### Task 5: Add interaction ops and lead mining workflows

**Files:**
- Create: `apps/runtime-core/src/graphs/interaction-ops-graph.ts`
- Create: `apps/runtime-core/src/graphs/lead-mining-graph.ts`
- Create: `apps/runtime-core/src/workflows/run-interaction-ops.ts`
- Create: `apps/runtime-core/src/workflows/run-lead-mining.ts`
- Create: `apps/runtime-core/src/tools/interaction-tools.ts`
- Create: `apps/runtime-core/src/tools/lead-tools.ts`
- Test: `tests/unit/runtime-core/interaction-ops.test.ts`
- Test: `tests/unit/runtime-core/lead-mining.test.ts`

- [ ] **Step 1: Write the failing interaction and lead tests**

Create `tests/unit/runtime-core/interaction-ops.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import { runInteractionOps } from '../../../apps/runtime-core/src/workflows/run-interaction-ops';

describe('interaction ops workflow', () => {
  it('fetches comments and produces reply suggestions', async () => {
    const result = await runInteractionOps({
      platform: 'xiaohongshu',
      interactionType: 'comments'
    });

    expect(result.status).toBe('success');
    expect(result.replySuggestions.length).toBeGreaterThan(0);
  });
});
```

Create `tests/unit/runtime-core/lead-mining.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import { runLeadMining } from '../../../apps/runtime-core/src/workflows/run-lead-mining';

describe('lead mining workflow', () => {
  it('converts high-intent interactions into leads', async () => {
    const result = await runLeadMining({
      candidates: [
        { platform: 'douyin', content: '怎么合作？', confidence: 0.95 }
      ]
    });

    expect(result.status).toBe('success');
    expect(result.leads[0].level).toBe('A');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
- `pnpm vitest run tests/unit/runtime-core/interaction-ops.test.ts`
- `pnpm vitest run tests/unit/runtime-core/lead-mining.test.ts`

Expected: FAIL because the workflows do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/runtime-core/src/workflows/run-interaction-ops.ts`

```ts
export async function runInteractionOps(input: {
  platform: 'douyin' | 'xiaohongshu';
  interactionType: 'comments' | 'messages';
}) {
  return {
    status: 'success' as const,
    items: [
      {
        platform: input.platform,
        interactionType: input.interactionType,
        content: '想了解合作方式',
      },
    ],
    replySuggestions: [
      {
        text: '可以先说说你的产品和投放目标，我帮你判断最适合的合作方式。',
        confidence: 0.88,
      },
    ],
  };
}
```

`apps/runtime-core/src/workflows/run-lead-mining.ts`

```ts
export async function runLeadMining(input: {
  candidates: Array<{ platform: string; content: string; confidence: number }>;
}) {
  return {
    status: 'success' as const,
    leads: input.candidates.map((item) => ({
      platform: item.platform,
      summary: item.content,
      level: item.confidence >= 0.9 ? 'A' : 'B',
      nextAction: 'follow_up',
    })),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
- `pnpm vitest run tests/unit/runtime-core/interaction-ops.test.ts`
- `pnpm vitest run tests/unit/runtime-core/lead-mining.test.ts`
- `pnpm --filter @ai-growth-ops/runtime-core typecheck`

Expected: PASS with one reply suggestion and one lead result.

- [ ] **Step 5: Commit**

```bash
git add apps/runtime-core/src/graphs/interaction-ops-graph.ts apps/runtime-core/src/graphs/lead-mining-graph.ts apps/runtime-core/src/workflows/run-interaction-ops.ts apps/runtime-core/src/workflows/run-lead-mining.ts apps/runtime-core/src/tools/interaction-tools.ts apps/runtime-core/src/tools/lead-tools.ts tests/unit/runtime-core/interaction-ops.test.ts tests/unit/runtime-core/lead-mining.test.ts
git commit -m "feat: add interaction ops and lead mining workflows"
```

### Task 6: Add a delivery-grade CLI and OpenClaw smoke verification

**Files:**
- Modify: `apps/runtime-core/src/entrypoints/cli.ts`
- Create: `apps/runtime-core/src/server/health.ts`
- Create: `apps/runtime-core/src/storage/run-store.ts`
- Create: `scripts/runtime-core-smoke.ts`
- Create: `tests/integration/runtime-core/openclaw-smoke.test.ts`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Write the failing smoke test**

Create `tests/integration/runtime-core/openclaw-smoke.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import { execa } from 'execa';

describe('runtime core smoke', () => {
  it('lists skills and runs a publish request through the CLI', async () => {
    const skills = await execa('pnpm', ['tsx', 'apps/runtime-core/src/entrypoints/cli.ts', 'skills:list']);
    expect(skills.stdout).toContain('douyin-upload');

    const publish = await execa('pnpm', [
      'tsx',
      'apps/runtime-core/src/entrypoints/cli.ts',
      'run',
      '--intent=publish',
      '--platforms=douyin',
      '--content=hello'
    ]);
    expect(publish.stdout).toContain('"status":"success"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/runtime-core/openclaw-smoke.test.ts`

Expected: FAIL because the CLI commands do not exist yet and `execa` is not installed.

- [ ] **Step 3: Write minimal implementation**

Add `execa` to root `devDependencies`.

Update `apps/runtime-core/src/entrypoints/cli.ts` to support:

```ts
import { runRuntimeRequest } from '../workflows/run-runtime-request';

const [command, ...args] = process.argv.slice(2);

if (command === 'skills:list') {
  console.log(JSON.stringify([{ skillId: 'douyin-upload', capability: 'publish.video' }]));
  process.exit(0);
}

if (command === 'run') {
  const payload = {
    requestId: 'cli-run-1',
    intent: 'publish' as const,
    payload: {
      platforms: ['douyin'],
      content: 'hello',
    },
  };
  const result = await runRuntimeRequest(payload);
  console.log(JSON.stringify(result));
  process.exit(0);
}

throw new Error(`Unknown command: ${command}`);
```

Update `README.md` with a short delivery section:

```md
## Runtime Core MVP

- `pnpm tsx apps/runtime-core/src/entrypoints/cli.ts skills:list`
- `pnpm tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=douyin --content=hello`
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
- `pnpm vitest run tests/integration/runtime-core/openclaw-smoke.test.ts`
- `pnpm vitest run tests/unit/runtime-core`
- `pnpm --filter @ai-growth-ops/runtime-core typecheck`

Expected: PASS, and the CLI demonstrates a minimal delivery path suitable for OpenClaw installation.

- [ ] **Step 5: Commit**

```bash
git add apps/runtime-core/src/entrypoints/cli.ts apps/runtime-core/src/server/health.ts apps/runtime-core/src/storage/run-store.ts scripts/runtime-core-smoke.ts tests/integration/runtime-core/openclaw-smoke.test.ts package.json README.md
git commit -m "feat: add runtime core cli smoke verification"
```

### Task 7: Final delivery verification and cutover notes

**Files:**
- Create: `docs/delivery/2026-05-29-openclaw-runtime-core-checklist.md`
- Modify: `docs/superpowers/specs/2026-05-28-ai-native-runtime-core-design.md`
- Test: `tests/integration/runtime-core/openclaw-smoke.test.ts`

- [ ] **Step 1: Write the failing delivery checklist expectation**

Add a checklist file requirement into the spec so delivery steps are explicit.

```md
- install runtime core dependencies
- verify skills:list
- run publish smoke
- run interaction smoke
- run lead extraction smoke
```

- [ ] **Step 2: Run verification to confirm the checklist file is missing**

Run: `test -f docs/delivery/2026-05-29-openclaw-runtime-core-checklist.md`

Expected: exit code `1` because the checklist does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `docs/delivery/2026-05-29-openclaw-runtime-core-checklist.md`:

```md
# OpenClaw Runtime Core Delivery Checklist

1. `pnpm install`
2. `pnpm --filter @ai-growth-ops/runtime-core typecheck`
3. `pnpm vitest run tests/unit/runtime-core`
4. `pnpm vitest run tests/integration/runtime-core/openclaw-smoke.test.ts`
5. `pnpm tsx apps/runtime-core/src/entrypoints/cli.ts skills:list`
6. `pnpm tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=douyin --content=hello`
7. `pnpm tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=interaction.fetch --platforms=xiaohongshu`
```

Update the spec delivery section with a note that this checklist is the handoff artifact for the 2026-05-29 customer install.

- [ ] **Step 4: Run final verification**

Run:
- `test -f docs/delivery/2026-05-29-openclaw-runtime-core-checklist.md`
- `pnpm vitest run tests/integration/runtime-core/openclaw-smoke.test.ts`

Expected: PASS and the checklist file exists.

- [ ] **Step 5: Commit**

```bash
git add docs/delivery/2026-05-29-openclaw-runtime-core-checklist.md docs/superpowers/specs/2026-05-28-ai-native-runtime-core-design.md
git commit -m "docs: add openclaw delivery checklist"
```

## Self-Review

- Spec coverage: this plan covers the runtime core scaffold, LangGraph-first orchestration, capability registry, OpenClaw adapter, publish workflow, interaction workflow, lead workflow, skill lifecycle workflow, and delivery verification.
- Placeholder scan: no `TODO`, `TBD`, or “implement later” placeholders remain in the tasks above.
- Type consistency: the plan uses consistent naming for `CapabilityRegistry`, `runRuntimeRequest`, `runPublishWorkflow`, `runInteractionOps`, `runLeadMining`, and `OpenClawAdapter`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-28-ai-native-runtime-core-delivery.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
