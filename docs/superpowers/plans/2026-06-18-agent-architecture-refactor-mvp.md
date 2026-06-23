# Agent 架构重构 — 第一刀 MVP 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在新建的 `@ai-growth-ops/runtime` 编排内核里，实现 supervisor 状态机驱动的"内容→发布"闭环（content-agent + publish-agent + L2 自主等级 gate + L0/L1 记忆 + BullMQ 异步执行 + Workbench API），达到生产级交付标准。

**Architecture:** 6 层架构的中间 4 层 runtime-agnostic 内核。复用现有 `packages/ai-tools`（ToolRegistry）、`packages/ai`（runAgentLoop / LLMClient）、`packages/skills`（领域 skill runner）、`apps/browser-runner`（真实浏览器）、`apps/worker`（BullMQ）、`packages/database`（Prisma）。supervisor 状态机（5 节点固定 loop）派发给业务 agent；agent 用 `runAgentLoop` 自主 multi-step；写操作过统一 `ConfirmationGate`（L2 风控）；记忆分 L0（AgentRun 进程态）/ L1（AppConfig 偏好）。增量迁移：新内核跑通后再删旧的 ai-tools 53 tool / growth-ops-agent 9 tool / workflow.execute。

**Tech Stack:** TypeScript 5.8（ESM，`moduleResolution: Bundler`，内部 import 带 `.js` 后缀）、pnpm 10.33 workspace、Vitest 3.1（根 `tests/`，串行）、Prisma 5.22（PostgreSQL）、BullMQ（Redis）、原生 Anthropic/OpenAI SDK（经 `@ai-growth-ops/ai`）、tsup 构建。

**Spec:** `docs/superpowers/specs/2026-06-18-agent-architecture-refactor-design.md`

## Global Constraints

- **ESM import 后缀**：所有相对 import 必须带 `.js`（如 `./types.js`），即使源文件是 `.ts`。类型用 `import type`。
- **测试位置**：新测试放 `tests/unit/packages/runtime/*.test.ts`（单元）和 `tests/integration/runtime/*.test.ts`（集成），不在 package 内。命令 `pnpm vitest run tests/unit/packages/runtime/<file>.test.ts`。串行执行（`fileParallelism:false`），registry 等全局状态安全。
- **新 package 配置同步 4 处**：`tsconfig.base.json` paths、`vitest.config.ts` alias、`packages/shared/src/workspace.ts` workspacePackageNames、`scripts/check-architecture-drift.ts` DEFAULT_SCAN_DIRS。漏一处 `pnpm test:architecture` 或 `tests/unit/workspace.structure.test.ts` 会红。
- **runtime-agnostic 约束**：`packages/runtime/src/**` 严禁 import `apps/*`。架构守卫会加 error 规则强制。
- **Zod 统一**：新 tool 定义用 Zod schema（`z.ZodType`），对齐 `packages/ai-tools` 现有约定，禁用手写 JSON Schema（迁移 mcp-server tool 时转 Zod）。
- **错误处理**：走抛 `Error` + try/catch，项目无 Result/Ok/Err 类型，不要引入。
- **凭证隔离**：cookie/凭证绝不进 LLM 上下文或日志；browser-runner 调用经 `BrowserRunnerClient`，cookie 从 DB `PlatformAccount.cookieRef` 经 `decryptToken` 解密后放 request body。
- **复用优先**：不重写 browser-runner / 7 skill / publish.execute 幂等 / BullMQ 基础设施。
- **MCP adapter 第一刀后置**：registry 已为双投影预留，第一刀只做 Workbench API。
- **提交规范**：每个 task 末尾 commit，message 用 conventional commits，结尾空行 + `Co-Authored-By: Claude <noreply@anthropic.com>`。

## File Structure

新建 `packages/runtime/`：

```
packages/runtime/
  package.json
  tsconfig.json
  src/
    index.ts                    # 公共导出
    types.ts                    # 【契约】所有内核接口/枚举/类型（Task 2）
    confirmation-gate.ts        # L2 自主等级风控 gate（Task 3）
    memory/
      index.ts                  # Memory 接口聚合
      working-memory.ts         # L0 工作记忆（进程内 Map + AgentRun 持久化）（Task 4）
      preferences.ts            # L1 用户偏好（AppConfig，修 userId_key）（Task 4）
    tool-access.ts              # 按 agent 可见域过滤 tool + mutate 推断（Task 5）
    agent-loop.ts               # 包装 runAgentLoop，注入 gate/memory/可见 tool（Task 6）
    agents/
      index.ts
      content-agent.ts          # content-agent 定义（Task 7）
      publish-agent.ts          # publish-agent 定义（Task 7）
    supervisor/
      index.ts
      loop-nodes.ts             # 5 节点定义 + 转移图（Task 8）
      supervisor.ts             # 状态机引擎 + 智能转移（Task 8）
```

修改：
- `tsconfig.base.json`、`vitest.config.ts`、`packages/shared/src/workspace.ts`、`scripts/check-architecture-drift.ts`（Task 1）
- `packages/database/prisma/schema.prisma`（Task 4：AgentRun 加 tokensUsed）
- `apps/worker/src/queue.ts`、`apps/worker/src/job-handlers/agent.run.ts`、`apps/worker/src/index.ts`（Task 9）
- `apps/api/src/routes.ts`（Task 10：新 agent run 路由）

测试：
- `tests/unit/packages/runtime/{types,confirmation-gate,working-memory,preferences,tool-access,agent-loop,content-agent,publish-agent,loop-nodes,supervisor}.test.ts`
- `tests/integration/runtime/content-publish-loop.test.ts`（Task 11）

## Task 依赖与并行性

```
Task 1 (骨架+配置) ── 串行前置
   └─ Task 2 (契约 types.ts) ── 串行前置
         ├─ Task 3 (ConfirmationGate)  ┐
         ├─ Task 4 (Memory L0/L1)      ├─ 可三路并行（契约定死后）
         └─ Task 5 (Tool 可见域)        ┘
               └─ Task 6 (agent-loop 包装) ── 依赖 3/4/5
                     └─ Task 7 (content+publish agent) ── 可两路并行
                           └─ Task 8 (supervisor 状态机)
                                 └─ Task 9 (BullMQ handler)
                                       └─ Task 10 (Workbench API)
                                             └─ Task 11 (E2E 集成)
                                                   └─ Task 12 (守卫+文档+清理)
```

Task 3/4/5、Task 7 的两个 agent，是 subagent 并发执行点。

---

### Task 1: 新建 `packages/runtime` 骨架 + 全局配置同步

**Files:**
- Create: `packages/runtime/package.json`
- Create: `packages/runtime/tsconfig.json`
- Create: `packages/runtime/src/index.ts`
- Modify: `tsconfig.base.json`（paths 加 runtime）
- Modify: `vitest.config.ts`（alias 加 runtime）
- Modify: `packages/shared/src/workspace.ts`（workspacePackageNames 加 runtime）
- Modify: `scripts/check-architecture-drift.ts`（DEFAULT_SCAN_DIRS 加 runtime/src + 加 error 规则禁 apps/* 依赖）
- Test: `tests/unit/packages/runtime/skeleton.test.ts`

**Interfaces:**
- Produces: 一个可被 import 的空 `@ai-growth-ops/runtime` package；4 处配置同步；架构守卫保护 runtime 不依赖 apps/*。

- [ ] **Step 1: 创建 package.json**

`packages/runtime/package.json`:
```json
{
  "name": "@ai-growth-ops/runtime",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup --config ../../tsup.config.ts",
    "typecheck": "tsc --project tsconfig.json --noEmit"
  },
  "dependencies": {
    "@ai-growth-ops/ai": "workspace:*",
    "@ai-growth-ops/ai-tools": "workspace:*",
    "@ai-growth-ops/capability-schema": "workspace:*",
    "@ai-growth-ops/database": "workspace:*",
    "@ai-growth-ops/observability": "workspace:*",
    "@ai-growth-ops/skills": "workspace:*",
    "zod": "^3.23.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

`packages/runtime/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: 创建空 index.ts**

`packages/runtime/src/index.ts`:
```ts
// @ai-growth-ops/runtime — agent orchestration kernel
// Public exports are added incrementally in later tasks.
export const PACKAGE_NAME = '@ai-growth-ops/runtime';
```

- [ ] **Step 4: 同步 tsconfig.base.json paths**

在 `tsconfig.base.json` 的 `paths` 对象里追加一行（紧跟 `@ai-growth-ops/skills` 之后）：
```json
"@ai-growth-ops/runtime": ["packages/runtime/src/index.ts"],
```

- [ ] **Step 5: 同步 vitest.config.ts alias**

在 `vitest.config.ts` 的 `resolve.alias` 里追加：
```ts
'@ai-growth-ops/runtime': fileURLToPath(new URL('./packages/runtime/src/index.ts', import.meta.url)),
```

- [ ] **Step 6: 同步 workspace.ts**

在 `packages/shared/src/workspace.ts` 的 `workspacePackageNames` 数组里，`'@ai-growth-ops/skills'` 之后追加：
```ts
  '@ai-growth-ops/runtime'
```

- [ ] **Step 7: 同步架构守卫**

在 `scripts/check-architecture-drift.ts` 的 `DEFAULT_SCAN_DIRS` 数组追加 `'packages/runtime/src'`。

在 `defaultDriftRules` 数组追加一条 error 规则（禁止 runtime 依赖 apps）：
```ts
{
  ruleId: 'no-runtime-depends-on-apps',
  severity: 'error',
  description: 'runtime kernel must stay runtime-agnostic — no imports from apps/*',
  match: (filePath, source) =>
    filePath.includes('packages/runtime/src') &&
    /from\s+['"](\.\.\/)+apps\/|@ai-growth-ops\/(api|web|worker|browser-runner)['"]/.test(source)
}
```
（实现细节以 `scripts/check-architecture-drift.ts` 现有规则形状为准；若 match 签名不同，对齐现有规则写法。）

- [ ] **Step 8: 写骨架测试**

`tests/unit/packages/runtime/skeleton.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('runtime package skeleton', () => {
  it('is importable', async () => {
    const mod = await import('@ai-growth-ops/runtime');
    expect(mod.PACKAGE_NAME).toBe('@ai-growth-ops/runtime');
  });
});
```

- [ ] **Step 9: 运行测试 + 守卫，确认全绿**

```bash
pnpm install
pnpm vitest run tests/unit/packages/runtime/skeleton.test.ts
pnpm test:architecture
pnpm vitest run tests/unit/workspace.structure.test.ts
```
Expected: skeleton test PASS；architecture 无 error（新规则不误报）；workspace.structure PASS（runtime 在列表里）。

- [ ] **Step 10: Commit**

```bash
git add packages/runtime tsconfig.base.json vitest.config.ts packages/shared/src/workspace.ts scripts/check-architecture-drift.ts tests/unit/packages/runtime/skeleton.test.ts
git commit -m "feat(runtime): scaffold @ai-growth-ops/runtime package + wire global config

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 内核契约（types.ts — 所有后续 task 的依赖）

**Files:**
- Create: `packages/runtime/src/types.ts`
- Modify: `packages/runtime/src/index.ts`（re-export）
- Test: `tests/unit/packages/runtime/types.test.ts`

**Interfaces:**
- Produces（后续所有 task 消费这些类型，签名以此为准）:
  - `ToolDomain = 'content'|'publish'|'interaction'|'lead'|'auth'|'shared'|'meta'`
  - `Mutate = 'Read' | 'Write'`
  - `AutonomyLevel = 'L1_COPILOT' | 'L2_AUTOPILOT_LIGHT' | 'L3_FULL_AUTOPILOT'`
  - `RiskLevel = 'low' | 'medium' | 'high'`
  - `GateDecision { allowed: boolean; escalated: boolean; reason: string; simulatedOutput?: unknown }`
  - `GateInput { toolName: string; mutate: Mutate; input: unknown; risk: RiskLevel; confidence: number; autonomyLevel: AutonomyLevel; dryRun: boolean }`
  - `interface ConfirmationGate { check(input: GateInput): GateDecision }`
  - `interface WorkingMemory { get(runId, key): Promise<unknown>; set(runId, key, value): Promise<void>; all(runId): Promise<Record<string, unknown>>; clear(runId): Promise<void> }`
  - `type PreferenceDomain = 'content' | 'publish' | 'interaction' | 'lead' | 'global'`
  - `interface UserPreferences { preferredPlatforms: string[]; defaultContentType: string; preferredPublishTimes: string[]; contentStylePreferences: string; replyStylePreferences: string; avoidTopics: string[]; brandVoice: string }`
  - `interface PreferencesStore { get(userId): Promise<UserPreferences>; set(userId, key: keyof UserPreferences, value: string|string[]): Promise<void>; forDomain(userId, domain: PreferenceDomain): Promise<Partial<UserPreferences>> }`
  - `interface AgentDefinition { name: string; domain: ToolDomain; description: string; systemPromptBuilder(ctx: AgentSystemPromptContext): string; allowedTools: string[]; mutateInference?: Record<string, Mutate> }`
  - `interface AgentSystemPromptContext { userId: string; orgId: string; nodeName: string; preferences: Partial<UserPreferences>; workingMemory: Record<string, unknown> }`
  - `type LoopNode = 'INIT' | 'METRICS' | 'CONTENT' | 'PUBLISH' | 'REVIEW'`
  - `type NodeOutcome = 'done' | 'need_input' | 'blocked' | 'empty'`
  - `interface NodeResult { node: LoopNode; outcome: NodeOutcome; output?: unknown; summary?: string; escalatedItems?: Array<{ toolName: string; input: unknown; risk: RiskLevel }> }`
  - `interface SupervisorState { runId: string; userId: string; orgId: string; autonomyLevel: AutonomyLevel; dryRun: boolean; currentNode: LoopNode; nodeResults: Record<LoopNode, NodeResult | undefined>; startedAt: string; status: 'running' | 'paused' | 'completed' | 'failed' }`

- [ ] **Step 1: 写契约测试（验证类型可被消费 + 值形状）**

`tests/unit/packages/runtime/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type {
  AutonomyLevel, RiskLevel, GateDecision, GateInput, ConfirmationGate,
  WorkingMemory, UserPreferences, PreferenceDomain, PreferencesStore,
  AgentDefinition, LoopNode, NodeOutcome, NodeResult, SupervisorState, ToolDomain, Mutate
} from '@ai-growth-ops/runtime';

describe('runtime kernel contracts', () => {
  it('autonomy levels cover the three tiers', () => {
    const levels: AutonomyLevel[] = ['L1_COPILOT', 'L2_AUTOPILOT_LIGHT', 'L3_FULL_AUTOPILOT'];
    expect(levels).toHaveLength(3);
  });

  it('shapes a default supervisor state', () => {
    const state: SupervisorState = {
      runId: 'r1', userId: 'u1', orgId: 'o1',
      autonomyLevel: 'L2_AUTOPILOT_LIGHT', dryRun: false,
      currentNode: 'INIT',
      nodeResults: { INIT: undefined, METRICS: undefined, CONTENT: undefined, PUBLISH: undefined, REVIEW: undefined },
      startedAt: '2026-06-18T00:00:00.000Z', status: 'running'
    };
    expect(state.currentNode).toBe('INIT');
  });

  it('defines the first-slice loop nodes', () => {
    const nodes: LoopNode[] = ['INIT', 'METRICS', 'CONTENT', 'PUBLISH', 'REVIEW'];
    expect(nodes).toHaveLength(5);
  });

  it('gate decision carries allow + escalate flags', () => {
    const d: GateDecision = { allowed: true, escalated: false, reason: 'low risk auto-approve' };
    expect(d.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败（类型未导出）**

```bash
pnpm vitest run tests/unit/packages/runtime/types.test.ts
```
Expected: FAIL — 编译错误 `Module '"@ai-growth-ops/runtime"' has no exported member 'AutonomyLevel'`。

- [ ] **Step 3: 写 types.ts**

`packages/runtime/src/types.ts`:
```ts
// ── Tool classification ──
export type ToolDomain = 'content' | 'publish' | 'interaction' | 'lead' | 'auth' | 'shared' | 'meta';
export type Mutate = 'Read' | 'Write';

// ── Autonomy / risk (ConfirmationGate) ──
export type AutonomyLevel = 'L1_COPILOT' | 'L2_AUTOPILOT_LIGHT' | 'L3_FULL_AUTOPILOT';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface GateInput {
  toolName: string;
  mutate: Mutate;
  input: unknown;
  risk: RiskLevel;
  /** agent self-assessed confidence 0..1 */
  confidence: number;
  autonomyLevel: AutonomyLevel;
  dryRun: boolean;
}
export interface GateDecision {
  allowed: boolean;
  escalated: boolean;
  reason: string;
  /** present only when dry-run blocks with a simulated result */
  simulatedOutput?: unknown;
}
export interface ConfirmationGate {
  check(input: GateInput): GateDecision;
}

// ── Memory ──
export interface WorkingMemory {
  get(runId: string, key: string): Promise<unknown>;
  set(runId: string, key: string, value: unknown): Promise<void>;
  all(runId: string): Promise<Record<string, unknown>>;
  clear(runId: string): Promise<void>;
}

export type PreferenceDomain = 'content' | 'publish' | 'interaction' | 'lead' | 'global';

export interface UserPreferences {
  preferredPlatforms: string[];
  defaultContentType: string;
  preferredPublishTimes: string[];
  contentStylePreferences: string;
  replyStylePreferences: string;
  avoidTopics: string[];
  brandVoice: string;
}

export interface PreferencesStore {
  get(userId: string): Promise<UserPreferences>;
  set(userId: string, key: keyof UserPreferences, value: string | string[]): Promise<void>;
  forDomain(userId: string, domain: PreferenceDomain): Promise<Partial<UserPreferences>>;
}

// ── Agents ──
export interface AgentSystemPromptContext {
  userId: string;
  orgId: string;
  nodeName: string;
  preferences: Partial<UserPreferences>;
  workingMemory: Record<string, unknown>;
}

export interface AgentDefinition {
  name: string;
  domain: ToolDomain;
  description: string;
  systemPromptBuilder(ctx: AgentSystemPromptContext): string;
  /** allow-list of tool names this agent may call (exact match). */
  allowedTools: string[];
  /** optional explicit mutate override per tool name; otherwise inferred from domain. */
  mutateInference?: Record<string, Mutate>;
}

// ── Supervisor loop (first slice: INIT→METRICS→CONTENT→PUBLISH→REVIEW) ──
export type LoopNode = 'INIT' | 'METRICS' | 'CONTENT' | 'PUBLISH' | 'REVIEW';
export type NodeOutcome = 'done' | 'need_input' | 'blocked' | 'empty';

export interface NodeResult {
  node: LoopNode;
  outcome: NodeOutcome;
  output?: unknown;
  summary?: string;
  escalatedItems?: Array<{ toolName: string; input: unknown; risk: RiskLevel }>;
}

export interface SupervisorState {
  runId: string;
  userId: string;
  orgId: string;
  autonomyLevel: AutonomyLevel;
  dryRun: boolean;
  currentNode: LoopNode;
  nodeResults: Record<LoopNode, NodeResult | undefined>;
  startedAt: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
}
```

- [ ] **Step 4: 在 index.ts re-export**

`packages/runtime/src/index.ts`（替换全部内容）:
```ts
// @ai-growth-ops/runtime — agent orchestration kernel
export const PACKAGE_NAME = '@ai-growth-ops/runtime';

export * from './types.js';
```

- [ ] **Step 5: 跑测试确认通过**

```bash
pnpm vitest run tests/unit/packages/runtime/types.test.ts
```
Expected: PASS（4 个 it 全绿）。

- [ ] **Step 6: typecheck + 守卫**

```bash
pnpm --filter @ai-growth-ops/runtime typecheck
pnpm test:architecture
```
Expected: typecheck 0 error；architecture 无新 error。

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src tests/unit/packages/runtime/types.test.ts
git commit -m "feat(runtime): define kernel contracts (types.ts)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: ConfirmationGate（L2 自主等级风控）

**Files:**
- Create: `packages/runtime/src/confirmation-gate.ts`
- Modify: `packages/runtime/src/index.ts`
- Test: `tests/unit/packages/runtime/confirmation-gate.test.ts`

**Interfaces:**
- Consumes: `ConfirmationGate`, `GateInput`, `GateDecision`, `AutonomyLevel`, `RiskLevel`（from Task 2）。
- Produces: `class DefaultConfirmationGate implements ConfirmationGate`；工厂 `createConfirmationGate()`。

**风控规则（以此为准）：**
- `dryRun: true` → `allowed:false, escalated:false, reason:'dry-run mode'`，附 `simulatedOutput: { dryRun: true, toolName }`。
- `mutate: 'Read'` → 始终 `allowed:true, escalated:false`。
- `mutate: 'Write'`：
  - L1 → `allowed:false, escalated:true`（全人工）。
  - L2 → `risk:'low' && confidence>=0.7` 放行（`allowed:true, escalated:false`）；否则 escalate（`allowed:false, escalated:true`）。
  - L3 → 始终放行（`allowed:true, escalated:false, reason:'full autopilot'`）。

- [ ] **Step 1: 写失败测试**

`tests/unit/packages/runtime/confirmation-gate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createConfirmationGate } from '@ai-growth-ops/runtime';
import type { GateInput } from '@ai-growth-ops/runtime';

function writeInput(over: Partial<GateInput> = {}): GateInput {
  return {
    toolName: 'publish.video', mutate: 'Write', input: {}, risk: 'low',
    confidence: 0.9, autonomyLevel: 'L2_AUTOPILOT_LIGHT', dryRun: false, ...over
  };
}

describe('DefaultConfirmationGate', () => {
  const gate = createConfirmationGate();

  it('dry-run blocks every write with a simulated output', () => {
    const d = gate.check(writeInput({ dryRun: true }));
    expect(d.allowed).toBe(false);
    expect(d.escalated).toBe(false);
    expect(d.simulatedOutput).toMatchObject({ dryRun: true, toolName: 'publish.video' });
  });

  it('always allows reads regardless of autonomy', () => {
    for (const lvl of ['L1_COPILOT', 'L2_AUTOPILOT_LIGHT', 'L3_FULL_AUTOPILOT'] as const) {
      expect(gate.check(writeInput({ mutate: 'Read', autonomyLevel: lvl })).allowed).toBe(true);
    }
  });

  it('L1 escalates all writes', () => {
    const d = gate.check(writeInput({ autonomyLevel: 'L1_COPILOT', risk: 'low', confidence: 0.99 }));
    expect(d.allowed).toBe(false);
    expect(d.escalated).toBe(true);
  });

  it('L2 auto-approves low-risk high-confidence writes', () => {
    const d = gate.check(writeInput({ autonomyLevel: 'L2_AUTOPILOT_LIGHT', risk: 'low', confidence: 0.8 }));
    expect(d.allowed).toBe(true);
    expect(d.escalated).toBe(false);
  });

  it('L2 escalates high-risk writes', () => {
    const d = gate.check(writeInput({ autonomyLevel: 'L2_AUTOPILOT_LIGHT', risk: 'high', confidence: 0.95 }));
    expect(d.allowed).toBe(false);
    expect(d.escalated).toBe(true);
  });

  it('L2 escalates low-confidence writes', () => {
    const d = gate.check(writeInput({ autonomyLevel: 'L2_AUTOPILOT_LIGHT', risk: 'low', confidence: 0.5 }));
    expect(d.allowed).toBe(false);
    expect(d.escalated).toBe(true);
  });

  it('L3 auto-approves all writes', () => {
    const d = gate.check(writeInput({ autonomyLevel: 'L3_FULL_AUTOPILOT', risk: 'high', confidence: 0.1 }));
    expect(d.allowed).toBe(true);
    expect(d.escalated).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm vitest run tests/unit/packages/runtime/confirmation-gate.test.ts
```
Expected: FAIL — `createConfirmationGate is not a function`。

- [ ] **Step 3: 实现 confirmation-gate.ts**

`packages/runtime/src/confirmation-gate.ts`:
```ts
import type { ConfirmationGate, GateDecision, GateInput } from './types.js';

const LOW_RISK_CONFIDENCE_FLOOR = 0.7;

export class DefaultConfirmationGate implements ConfirmationGate {
  check(input: GateInput): GateDecision {
    if (input.dryRun) {
      return {
        allowed: false,
        escalated: false,
        reason: 'dry-run mode: write simulated, not executed',
        simulatedOutput: { dryRun: true, toolName: input.toolName, input: input.input }
      };
    }
    if (input.mutate === 'Read') {
      return { allowed: true, escalated: false, reason: 'read-only tool' };
    }
    // mutate === 'Write'
    switch (input.autonomyLevel) {
      case 'L1_COPILOT':
        return { allowed: false, escalated: true, reason: 'L1 copilot: all writes require human approval' };
      case 'L3_FULL_AUTOPILOT':
        return { allowed: true, escalated: false, reason: 'L3 full autopilot: write auto-executed' };
      case 'L2_AUTOPILOT_LIGHT':
      default: {
        const autoApprove = input.risk === 'low' && input.confidence >= LOW_RISK_CONFIDENCE_FLOOR;
        return autoApprove
          ? { allowed: true, escalated: false, reason: `L2 auto-approve (risk=${input.risk}, confidence=${input.confidence})` }
          : { allowed: false, escalated: true, reason: `L2 escalate (risk=${input.risk}, confidence=${input.confidence})` };
      }
    }
  }
}

export function createConfirmationGate(): ConfirmationGate {
  return new DefaultConfirmationGate();
}
```

- [ ] **Step 4: 在 index.ts re-export**

在 `packages/runtime/src/index.ts` 追加：
```ts
export { DefaultConfirmationGate, createConfirmationGate } from './confirmation-gate.js';
```

- [ ] **Step 5: 跑测试确认通过**

```bash
pnpm vitest run tests/unit/packages/runtime/confirmation-gate.test.ts
```
Expected: PASS（7 个 it 全绿）。

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/confirmation-gate.ts packages/runtime/src/index.ts tests/unit/packages/runtime/confirmation-gate.test.ts
git commit -m "feat(runtime): ConfirmationGate with L1/L2/L3 autonomy rules

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Memory 层（L0 工作 + L1 偏好）+ AgentRun.tokensUsed 迁移

**Files:**
- Create: `packages/runtime/src/memory/working-memory.ts`
- Create: `packages/runtime/src/memory/preferences.ts`
- Create: `packages/runtime/src/memory/index.ts`
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/database/prisma/schema.prisma`（AgentRun 加 tokensUsed）
- Create: migration（`pnpm db:migrate -n agent-run-tokens`）
- Test: `tests/unit/packages/runtime/working-memory.test.ts`
- Test: `tests/integration/runtime/preferences.test.ts`

**Interfaces:**
- Consumes: `WorkingMemory`, `PreferencesStore`, `UserPreferences`, `PreferenceDomain`（from Task 2）；`DatabaseClient` from `@ai-growth-ops/database`。
- Produces: `class InProcessWorkingMemory implements WorkingMemory`；`class AppConfigPreferencesStore implements PreferencesStore`；工厂 `createWorkingMemory()`、`createPreferencesStore(db, orgId)`。

**关键修正（来自调研）：** 现有 `agent_user_preferences` 读写有 bug——用 `findFirst({organizationId, key})` 导致 org 内多人共享偏好。迁移时改用 `userId_key` 复合唯一（对齐 `ai_config` 的 upsert 写法）。

**偏好→域映射（forDomain 裁剪，以此为准）：**
- `content` → `{ brandVoice, contentStylePreferences, avoidTopics, defaultContentType }`
- `publish` → `{ preferredPlatforms, preferredPublishTimes }`
- `interaction` → `{ replyStylePreferences, avoidTopics }`
- `lead` → `{}`
- `global` → 全部

- [ ] **Step 1: 改 Prisma schema，AgentRun 加 tokensUsed**

在 `packages/database/prisma/schema.prisma` 的 `model AgentRun`（约 line 993）里，`latencyMs Int?` 同区追加（若已有 latencyMs）或在合适位置加：
```prisma
  tokensUsed   Int?
```
（若 AgentRun 无 latencyMs 字段，则在 `error String?` 下方加 `tokensUsed Int?`。）

- [ ] **Step 2: 生成迁移**

```bash
pnpm db:migrate -n agent-run-tokens
```
Expected: 生成 `packages/database/prisma/migrations/<timestamp>_agent_run_tokens/migration.sql`，含 `ALTER TABLE "agent_runs" ADD COLUMN "tokens_used" INTEGER;`。

- [ ] **Step 3: 写 L0 工作记忆失败测试**

`tests/unit/packages/runtime/working-memory.test.ts`:
```ts
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
```

- [ ] **Step 4: 跑确认失败**

```bash
pnpm vitest run tests/unit/packages/runtime/working-memory.test.ts
```
Expected: FAIL — `createWorkingMemory is not a function`。

- [ ] **Step 5: 实现 working-memory.ts**

`packages/runtime/src/memory/working-memory.ts`:
```ts
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
```

- [ ] **Step 6: 写 L1 偏好集成测试（需 DB）**

`tests/integration/runtime/preferences.test.ts`:
```ts
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createDatabaseClient, resetDatabase, seedDatabase, type DatabaseClient } from '@ai-growth-ops/database';
import { createPreferencesStore } from '@ai-growth-ops/runtime';

describe('AppConfigPreferencesStore (integration)', () => {
  let db: DatabaseClient;
  let userId: string;

  let orgId: string;
  beforeAll(async () => {
    db = createDatabaseClient();
    await resetDatabase(db);
    await seedDatabase(db);
    userId = (await db.user.findFirst({ where: { email: 'admin@ai-growth-ops.local' } }))!.id;
    orgId = (await db.organization.findFirst())!.id;
  });
  afterAll(async () => { await db.$disconnect(); });

  it('returns defaults when no preferences saved', async () => {
    const store = createPreferencesStore(db, orgId);
    const prefs = await store.get(userId);
    expect(prefs.brandVoice).toBe('');
    expect(prefs.preferredPlatforms).toEqual([]);
  });

  it('sets and reads back a single field', async () => {
    const store = createPreferencesStore(db, orgId);
    await store.set(userId, 'brandVoice', 'friendly expert');
    expect((await store.get(userId)).brandVoice).toBe('friendly expert');
  });

  it('is scoped per user (not shared across org)', async () => {
    const store = createPreferencesStore(db, orgId);
    await store.set(userId, 'avoidTopics', ['politics']);
    const other = await store.get('nonexistent-user-id');
    expect(other.avoidTopics).toEqual([]);
  });

  it('forDomain returns the content subset only', async () => {
    const store = createPreferencesStore(db, orgId);
    await store.set(userId, 'brandVoice', 'v1');
    await store.set(userId, 'preferredPlatforms', ['douyin']);
    const contentPrefs = await store.forDomain(userId, 'content');
    expect(contentPrefs).toHaveProperty('brandVoice', 'v1');
    expect(contentPrefs).not.toHaveProperty('preferredPlatforms');
  });
});
```
> 注：beforeAll 用 `db.user.findFirst` / `db.organization.findFirst` 取 ID，不依赖 `seedDatabase` 返回 shape（seedDatabase 幂等建 admin + 默认 org）。

- [ ] **Step 7: 实现 preferences.ts**

`packages/runtime/src/memory/preferences.ts`:
```ts
import type { DatabaseClient } from '@ai-growth-ops/database';
import type { PreferencesStore, PreferenceDomain, UserPreferences } from '../types.js';

const PREF_KEY = 'agent_user_preferences';

const DEFAULTS: UserPreferences = {
  preferredPlatforms: [],
  defaultContentType: 'text_image',
  preferredPublishTimes: [],
  contentStylePreferences: '',
  replyStylePreferences: '',
  avoidTopics: [],
  brandVoice: ''
};

const DOMAIN_FIELDS: Record<PreferenceDomain, Array<keyof UserPreferences>> = {
  content: ['brandVoice', 'contentStylePreferences', 'avoidTopics', 'defaultContentType'],
  publish: ['preferredPlatforms', 'preferredPublishTimes'],
  interaction: ['replyStylePreferences', 'avoidTopics'],
  lead: [],
  global: Object.keys(DEFAULTS) as Array<keyof UserPreferences>
};

export class AppConfigPreferencesStore implements PreferencesStore {
  constructor(private readonly db: DatabaseClient, private readonly orgId: string) {}

  async get(userId: string): Promise<UserPreferences> {
    const row = await this.db.appConfig.findUnique({
      where: { userId_key: { userId, key: PREF_KEY } }
    });
    if (!row) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(row.value as Partial<UserPreferences>) };
  }

  async set(userId: string, key: keyof UserPreferences, value: string | string[]): Promise<void> {
    const current = await this.get(userId);
    const merged = { ...current, [key]: value };
    await this.db.appConfig.upsert({
      where: { userId_key: { userId, key: PREF_KEY } },
      create: { userId, key: PREF_KEY, organizationId: this.orgId, value: merged },
      update: { value: merged }
    });
  }

  async forDomain(userId: string, domain: PreferenceDomain): Promise<Partial<UserPreferences>> {
    const all = await this.get(userId);
    const fields = DOMAIN_FIELDS[domain];
    const out: Partial<UserPreferences> = {};
    for (const f of fields) out[f] = all[f];
    return out;
  }
}

export function createPreferencesStore(db: DatabaseClient, orgId: string): PreferencesStore {
  return new AppConfigPreferencesStore(db, orgId);
}
```
> 注：AppConfig 的 `organizationId` 是 NOT NULL，store 构造时注入 orgId（用户级偏好但需挂在 org 下以满足约束）。Task 9 的 `handleAgentRun` 从 `run.organizationId` 取 orgId 传入。

- [ ] **Step 8: memory/index.ts + index.ts re-export**

`packages/runtime/src/memory/index.ts`:
```ts
export { InProcessWorkingMemory, createWorkingMemory } from './working-memory.js';
export { AppConfigPreferencesStore, createPreferencesStore } from './preferences.js';
```

在 `packages/runtime/src/index.ts` 追加：
```ts
export * from './memory/index.js';
```

- [ ] **Step 9: 跑测试确认通过**

```bash
pnpm docker:up
pnpm db:generate
pnpm vitest run tests/unit/packages/runtime/working-memory.test.ts
pnpm vitest run tests/integration/runtime/preferences.test.ts
```
Expected: working-memory PASS；preferences PASS（4 个 it）。若 orgId 报错，按 Step 7 注释加 orgId 参数并更新测试。

- [ ] **Step 10: Commit**

```bash
git add packages/runtime/src/memory packages/runtime/src/index.ts packages/database/prisma/schema.prisma packages/database/prisma/migrations tests/unit/packages/runtime/working-memory.test.ts tests/integration/runtime/preferences.test.ts
git commit -m "feat(runtime): memory layer — L0 working + L1 preferences (fix userId_key scoping)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Tool 可见域 + mutate 推断

**Files:**
- Create: `packages/runtime/src/tool-access.ts`
- Modify: `packages/runtime/src/index.ts`
- Test: `tests/unit/packages/runtime/tool-access.test.ts`

**Interfaces:**
- Consumes: `AgentDefinition`, `Mutate`, `ToolDomain`（from Task 2）；`getAllTools`, `getTool`, `ToolDefinition` from `@ai-growth-ops/ai-tools`。
- Produces: `getToolsForAgent(agent: AgentDefinition): ToolDefinition[]`；`inferMutate(toolName: string, agent: AgentDefinition): Mutate`。

**mutate 推断规则（以此为准）：**
1. 若 `agent.mutateInference[toolName]` 存在 → 用它。
2. 否则 tool name 以 `publish.`、`interaction.reply`、`auth.login`、`lead.convert` 开头 → `Write`。
3. 否则 → `Read`。

> 注：现有 ai-tools tool 用 snake_case（`execute_publish`），新 runtime tool 用 `domain.action`（`publish.video`）。第一刀白名单用**实际注册的 tool name**。本 task 只提供过滤 + 推断函数，实际 tool 注册在 Task 7/agent 定义时用真实 name。

- [ ] **Step 1: 写失败测试**

`tests/unit/packages/runtime/tool-access.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getToolsForAgent, inferMutate } from '@ai-growth-ops/runtime';
import type { AgentDefinition } from '@ai-growth-ops/runtime';

const contentAgent: AgentDefinition = {
  name: 'content', domain: 'content', description: '',
  systemPromptBuilder: () => '',
  allowedTools: ['content.list_videos', 'content.write', 'shared.get_today_metrics']
};

describe('tool access', () => {
  it('inferMutate uses explicit override', () => {
    const agent: AgentDefinition = { ...contentAgent, mutateInference: { 'content.write': 'Read' } };
    expect(inferMutate('content.write', agent)).toBe('Read');
  });

  it('inferMutate marks publish/reply/auth.login/lead.convert as Write', () => {
    expect(inferMutate('publish.video', contentAgent)).toBe('Write');
    expect(inferMutate('interaction.reply_comment', contentAgent)).toBe('Write');
    expect(inferMutate('auth.login', contentAgent)).toBe('Write');
    expect(inferMutate('lead.convert', contentAgent)).toBe('Write');
  });

  it('inferMutate defaults to Read', () => {
    expect(inferMutate('content.list_videos', contentAgent)).toBe('Read');
    expect(inferMutate('shared.get_today_metrics', contentAgent)).toBe('Read');
  });

  it('getToolsForAgent returns only allow-listed tools that exist in registry', () => {
    const tools = getToolsForAgent(contentAgent);
    const names = tools.map((t) => t.name);
    // every returned tool is in the allow-list
    for (const n of names) expect(contentAgent.allowedTools).toContain(n);
  });
});
```
> 注：`getToolsForAgent` 测试允许返回空数组（若 allow-list 里的 name 尚未注册）；断言只验证"返回的都是 allow-listed"。Task 7 注册真实 tool 后自然填充。

- [ ] **Step 2: 跑确认失败**

```bash
pnpm vitest run tests/unit/packages/runtime/tool-access.test.ts
```
Expected: FAIL — `getToolsForAgent is not a function`。

- [ ] **Step 3: 实现 tool-access.ts**

`packages/runtime/src/tool-access.ts`:
```ts
import { getAllTools, type ToolDefinition } from '@ai-growth-ops/ai-tools';
import type { AgentDefinition, Mutate } from './types.js';

const WRITE_PREFIXES = ['publish.', 'interaction.reply', 'auth.login', 'lead.convert'];

export function inferMutate(toolName: string, agent: AgentDefinition): Mutate {
  if (agent.mutateInference?.[toolName]) return agent.mutateInference[toolName];
  return WRITE_PREFIXES.some((p) => toolName.startsWith(p)) ? 'Write' : 'Read';
}

export function getToolsForAgent(agent: AgentDefinition): ToolDefinition[] {
  const allow = new Set(agent.allowedTools);
  return getAllTools().filter((t) => allow.has(t.name));
}
```

- [ ] **Step 4: index.ts re-export**

在 `packages/runtime/src/index.ts` 追加：
```ts
export { getToolsForAgent, inferMutate } from './tool-access.js';
```

- [ ] **Step 5: 跑测试确认通过**

```bash
pnpm vitest run tests/unit/packages/runtime/tool-access.test.ts
```
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/tool-access.ts packages/runtime/src/index.ts tests/unit/packages/runtime/tool-access.test.ts
git commit -m "feat(runtime): tool access — agent-scoped allow-list + mutate inference

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: agent-loop 包装（注入 gate / memory / 可见 tool）

**Files:**
- Create: `packages/runtime/src/agent-loop.ts`
- Modify: `packages/runtime/src/index.ts`
- Test: `tests/unit/packages/runtime/agent-loop.test.ts`

**Interfaces:**
- Consumes: `AgentDefinition`, `AutonomyLevel`, `WorkingMemory`, `ConfirmationGate`（runtime）；`runAgentLoop`, `createLLMClient`, `ToolSpec`, `ToolCall`, `ToolResult`, `LLMMessage` from `@ai-growth-ops/ai`；`getToolsForAgent`, `inferMutate`（Task 5）；`ToolDefinition` from `@ai-growth-ops/ai-tools`。
- Produces: `runDomainAgent(params): Promise<DomainAgentResult>`。

```ts
interface RunDomainAgentParams {
  agent: AgentDefinition;
  userId: string;
  orgId: string;
  nodeName: string;
  task: string;                         // user message describing the node's goal
  autonomyLevel: AutonomyLevel;
  dryRun: boolean;
  workingMemory: WorkingMemory;
  preferences: Partial<UserPreferences>;
  confirmationGate: ConfirmationGate;
  /** injected for testing; defaults to createLLMClient() */
  llmClient?: LLMClient;
  maxSteps?: number;                    // default 8
}
interface DomainAgentResult {
  finalText: string;
  toolCallsExecuted: number;
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
  stepsCompleted: number;
  escalatedItems: Array<{ toolName: string; input: unknown; risk: RiskLevel }>;
}
```

**行为（以此为准）：**
- 从 `getToolsForAgent(agent)` 取可见 tool，转成 `ToolSpec[]`（`{name, description, inputSchema}`——ToolDefinition 的 inputSchema 是 Zod，需 `zodToJsonSchema` 转 JSON Schema 给 ToolSpec）。
- system prompt = `agent.systemPromptBuilder({userId, orgId, nodeName, preferences, workingMemory: snapshot})`。
- `onToolCall(call)`：
  1. `mutate = inferMutate(call.name, agent)`。
  2. agent 在 call arguments 里可带 `__risk`（默认 `'low'`）和 `__confidence`（默认 `0.8`）—— LLM 自评字段（从 arguments 拿并从实际 input 剥离）。
  3. `gate.check({toolName, mutate, input, risk, confidence, autonomyLevel, dryRun})`。
  4. `allowed` → 执行 tool `execute`，返回 ToolResult。
  5. `!allowed` → 记入 `escalatedItems`，返回 ToolResult output = `{blocked:true, reason, escalated:true}`（**不执行**），让 agent loop 继续（agent 看到被拦会转而报告而非重试）。
- 复用 `runAgentLoop`（packages/ai），传入 `client`/`systemPrompt`/`messages`/`tools`/`onToolCall`/`maxSteps`。

- [ ] **Step 1: 写失败测试（用 stub LLM client + 假 tool）**

`tests/unit/packages/runtime/agent-loop.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { runDomainAgent, createConfirmationGate, createWorkingMemory } from '@ai-growth-ops/runtime';
import type { AgentDefinition } from '@ai-growth-ops/runtime';
import type { LLMClient, LLMToolResponse } from '@ai-growth-ops/ai';

// LLM client stub: returns a final text immediately (no tool calls)
function stubClient(): LLMClient {
  return {
    chat: async () => ({ text: 'done', model: 'stub', provider: 'openai', tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, finishReason: 'stop', latencyMs: 1 }),
    chatWithTools: async (messages, opts): Promise<LLMToolResponse> => ({
      text: 'finished node', model: 'stub', provider: 'openai',
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: 'stop', latencyMs: 1, toolCalls: [], text2: ''
    } as unknown as LLMToolResponse),
    getProvider: () => 'openai', getModel: () => 'stub'
  } as unknown as LLMClient;
}

const agent: AgentDefinition = {
  name: 'content', domain: 'content', description: 'drafts content',
  systemPromptBuilder: (ctx) => `You are content agent. node=${ctx.nodeName}`,
  allowedTools: []  // no tools → loop ends immediately
};

describe('runDomainAgent', () => {
  it('runs to completion with no tools and returns final text', async () => {
    const result = await runDomainAgent({
      agent, userId: 'u', orgId: 'o', nodeName: 'CONTENT', task: 'draft a douyin post',
      autonomyLevel: 'L2_AUTOPILOT_LIGHT', dryRun: false,
      workingMemory: createWorkingMemory(), preferences: {},
      confirmationGate: createConfirmationGate(), llmClient: stubClient(), maxSteps: 3
    });
    expect(result.finalText).toBe('finished node');
    expect(result.toolCallsExecuted).toBe(0);
    expect(result.escalatedItems).toEqual([]);
  });
});
```
> 注：`runAgentLoop` 内部把 tool result 拼成文本；stub 的 `chatWithTools` 返回空 toolCalls 即终止。`LLMToolResponse.text2` 是占位避免 TS 报错——以 packages/ai 实际类型为准，调整 stub。

- [ ] **Step 2: 跑确认失败**

```bash
pnpm vitest run tests/unit/packages/runtime/agent-loop.test.ts
```
Expected: FAIL — `runDomainAgent is not a function`。

- [ ] **Step 3: 实现 agent-loop.ts**

`packages/runtime/src/agent-loop.ts`:
```ts
import { runAgentLoop, createLLMClient } from '@ai-growth-ops/ai';
import type { LLMClient, LLMMessage, ToolSpec, ToolCall, ToolResult } from '@ai-growth-ops/ai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getTool, type ToolDefinition } from '@ai-growth-ops/ai-tools';
import { getToolsForAgent, inferMutate } from './tool-access.js';
import type {
  AgentDefinition, AgentSystemPromptContext, AutonomyLevel, ConfirmationGate,
  RiskLevel, UserPreferences, WorkingMemory
} from './types.js';

export interface RunDomainAgentParams {
  agent: AgentDefinition;
  userId: string;
  orgId: string;
  nodeName: string;
  task: string;
  autonomyLevel: AutonomyLevel;
  dryRun: boolean;
  workingMemory: WorkingMemory;
  preferences: Partial<UserPreferences>;
  confirmationGate: ConfirmationGate;
  llmClient?: LLMClient;
  maxSteps?: number;
}

export interface DomainAgentResult {
  finalText: string;
  toolCallsExecuted: number;
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
  stepsCompleted: number;
  escalatedItems: Array<{ toolName: string; input: unknown; risk: RiskLevel }>;
}

function toToolSpec(tools: ToolDefinition[]): ToolSpec[] {
  return tools.map((t) => {
    const schema = zodToJsonSchema(t.inputSchema, { target: 'openApi3' });
    delete (schema as Record<string, unknown>).$schema;
    return { name: t.name, description: t.description, inputSchema: schema as Record<string, unknown> };
  });
}

export async function runDomainAgent(params: RunDomainAgentParams): Promise<DomainAgentResult> {
  const client = params.llmClient ?? createLLMClient();
  const visibleTools = getToolsForAgent(params.agent);
  const tools = toToolSpec(visibleTools);
  const escalatedItems: DomainAgentResult['escalatedItems'] = [];
  let toolCallsExecuted = 0;

  const ctx: AgentSystemPromptContext = {
    userId: params.userId, orgId: params.orgId, nodeName: params.nodeName,
    preferences: params.preferences,
    workingMemory: await params.workingMemory.all(params.nodeName) // best-effort snapshot
  };
  const systemPrompt = params.agent.systemPromptBuilder(ctx);
  const messages: LLMMessage[] = [{ role: 'user', content: params.task }];

  const onToolCall = async (call: ToolCall): Promise<ToolResult> => {
    const { __risk = 'low', __confidence = 0.8, ...input } = (call.arguments ?? {}) as Record<string, unknown>;
    const mutate = inferMutate(call.name, params.agent);
    const decision = params.confirmationGate.check({
      toolName: call.name, mutate, input,
      risk: __risk as RiskLevel, confidence: Number(__confidence),
      autonomyLevel: params.autonomyLevel, dryRun: params.dryRun
    });
    if (!decision.allowed) {
      if (decision.escalated) escalatedItems.push({ toolName: call.name, input, risk: __risk as RiskLevel });
      return { toolCallId: call.id, output: { blocked: true, escalated: decision.escalated, reason: decision.reason, simulatedOutput: decision.simulatedOutput } };
    }
    const tool = getTool(call.name);
    if (!tool) return { toolCallId: call.id, output: { error: `tool not found: ${call.name}` } };
    toolCallsExecuted++;
    const result = await tool.execute(input, { apiBase: '', headers: {}, orgId: params.orgId, userId: params.userId });
    return { toolCallId: call.id, output: result };
  };

  const agentResult = await runAgentLoop({
    client, systemPrompt, messages, tools, onToolCall, maxSteps: params.maxSteps ?? 8
  });

  return {
    finalText: agentResult.finalText,
    toolCallsExecuted,
    tokenUsage: agentResult.tokenUsage,
    stepsCompleted: agentResult.stepsCompleted,
    escalatedItems
  };
}
```

- [ ] **Step 4: index.ts re-export**

在 `packages/runtime/src/index.ts` 追加：
```ts
export { runDomainAgent } from './agent-loop.js';
export type { RunDomainAgentParams, DomainAgentResult } from './agent-loop.js';
```

- [ ] **Step 5: 跑测试确认通过**

```bash
pnpm --filter @ai-growth-ops/runtime typecheck
pnpm vitest run tests/unit/packages/runtime/agent-loop.test.ts
```
Expected: typecheck PASS；test PASS。若 `zod-to-json-schema` 未在 runtime 依赖，在 package.json dependencies 加 `"zod-to-json-schema": "^3.23.0"` 后 `pnpm install`。

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/agent-loop.ts packages/runtime/src/index.ts packages/runtime/package.json tests/unit/packages/runtime/agent-loop.test.ts
git commit -m "feat(runtime): agent-loop wrapper — gate + memory + scoped tools into runAgentLoop

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: content-agent + publish-agent 定义

**Files:**
- Create: `packages/runtime/src/agents/content-agent.ts`
- Create: `packages/runtime/src/agents/publish-agent.ts`
- Create: `packages/runtime/src/agents/index.ts`
- Modify: `packages/runtime/src/index.ts`
- Test: `tests/unit/packages/runtime/content-agent.test.ts`
- Test: `tests/unit/packages/runtime/publish-agent.test.ts`

**Interfaces:**
- Consumes: `AgentDefinition`（Task 2）；`getSharedSkillRunner`, `allSkillsToToolSpecs`, `createSkillToolCallHandler` from `@ai-growth-ops/skills`。
- Produces: `contentAgent: AgentDefinition`；`publishAgent: AgentDefinition`；`getFirstSliceAgents(): { content, publish }`。

**Tool 注册（第一刀真实 tool，注册进 ai-tools registry，Zod schema）：**
为避免新 tool 与旧 53 tool 命名冲突，第一刀新 tool 用 `domain.action` 命名注册（旧 snake_case tool 暂不动，后续迁移 task 清理）。两个 agent 的 `allowedTools` 引用这些新 tool name。

content-agent 可见 tool（第一刀）：
- `content.list_videos`（调 browser-runner `/assist/list-videos`）
- `content.write`（调现有 API `/api/content-items` 写草稿——复用 ai-tools `write_content` 的逻辑但用新名注册，或直接 allow `write_content`）
- `shared.get_today_metrics`（读 list_videos 聚合）

publish-agent 可见 tool（第一刀）：
- `publish.video`（调 browser-runner `/assist/publish`，mutate=Write）
- `publish.check_status`（调 `/assist/check-publish-status`）
- `auth.login`（调 `/session/start` + 轮询 `/session/:id/status`，mutate=Write）
- `auth.status`（检查 cookie 有效性）
- `shared.get_today_metrics`

> 实现策略：在 `agents/` 目录建一个 `tools.ts` 定义这些 Zod tool（executor 用 `BrowserRunnerClient` 或 `createApiCallerFromContext`），在 agent module 顶层 `registerToolGroup`。为控制 task 体量，本 task 先定义 **content.list_videos / publish.video / publish.check_status / auth.login / auth.status** 这 5 个真实 tool（其余复用 ai-tools 现有 `write_content`）。

- [ ] **Step 1: 写 content-agent 测试**

`tests/unit/packages/runtime/content-agent.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { contentAgent } from '@ai-growth-ops/runtime';

describe('content-agent definition', () => {
  it('declares content domain and allow-list', () => {
    expect(contentAgent.domain).toBe('content');
    expect(contentAgent.allowedTools).toContain('content.list_videos');
    expect(contentAgent.allowedTools).toContain('write_content');
  });

  it('builds a system prompt embedding preferences + node', () => {
    const prompt = contentAgent.systemPromptBuilder({
      userId: 'u', orgId: 'o', nodeName: 'CONTENT',
      preferences: { brandVoice: 'friendly', avoidTopics: ['politics'] },
      workingMemory: {}
    });
    expect(prompt).toContain('CONTENT');
    expect(prompt).toContain('friendly');
    expect(prompt).toContain('politics');
  });
});
```

- [ ] **Step 2: 写 publish-agent 测试**

`tests/unit/packages/runtime/publish-agent.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { publishAgent } from '@ai-growth-ops/runtime';

describe('publish-agent definition', () => {
  it('declares publish domain and allow-list including auth', () => {
    expect(publishAgent.domain).toBe('publish');
    expect(publishAgent.allowedTools).toContain('publish.video');
    expect(publishAgent.allowedTools).toContain('auth.login');
  });

  it('marks publish.video and auth.login as Write via mutateInference', () => {
    expect(publishAgent.mutateInference?.['publish.video']).toBe('Write');
    expect(publishAgent.mutateInference?.['auth.login']).toBe('Write');
  });
});
```

- [ ] **Step 3: 跑确认失败**

```bash
pnpm vitest run tests/unit/packages/runtime/content-agent.test.ts tests/unit/packages/runtime/publish-agent.test.ts
```
Expected: FAIL — `contentAgent` / `publishAgent` 未导出。

- [ ] **Step 4: 实现 agents/tools.ts（5 个真实 tool，Zod + BrowserRunnerClient）**

`packages/runtime/src/agents/tools.ts`:
```ts
import { z } from 'zod';
import { registerToolGroup, type ToolDefinition } from '@ai-growth-ops/ai-tools';
import { BrowserRunnerClient } from '@ai-growth-ops/growth-ops-agent';

const client = new BrowserRunnerClient();

const listVideos: ToolDefinition = {
  name: 'content.list_videos',
  description: 'List the account\'s own published videos with real performance stats (plays/likes/comments). Read-only.',
  inputSchema: z.object({
    platform: z.enum(['douyin']),
    limit: z.number().min(1).max(100).optional(),
    cookie: z.string().describe('decrypted platform cookie')
  }),
  execute: async ({ platform, cookie, limit }) =>
    client.listVideos(platform, cookie, limit as number | undefined)
};

const publishVideo: ToolDefinition = {
  name: 'publish.video',
  description: 'Publish content to a platform. WRITE — self-assess __risk and __confidence.',
  inputSchema: z.object({
    platform: z.enum(['douyin']),
    content: z.string(),
    title: z.string().optional(),
    mediaFilePaths: z.array(z.string()).optional(),
    cookie: z.string(),
    __risk: z.enum(['low', 'medium', 'high']).optional(),
    __confidence: z.number().min(0).max(1).optional()
  }),
  execute: async (args) => client.publish({
    platform: args.platform, cookie: args.cookie,
    contentType: 'video', content: args.content,
    title: args.title, mediaFilePaths: args.mediaFilePaths
  })
};

const checkStatus: ToolDefinition = {
  name: 'publish.check_status',
  description: 'Check publish/review status of a post. Read-only.',
  inputSchema: z.object({ platform: z.enum(['douyin']), cookie: z.string() }),
  execute: async ({ platform, cookie }) => client.checkPublishStatus(platform, cookie)
};

const authLogin: ToolDefinition = {
  name: 'auth.login',
  description: 'Start a QR-login session and poll until logged in. WRITE — returns cookies. Self-assess __risk.',
  inputSchema: z.object({
    platform: z.enum(['douyin']),
    __risk: z.enum(['low', 'medium', 'high']).optional(),
    __confidence: z.number().min(0).max(1).optional()
  }),
  execute: async ({ platform }) => {
    const session = await client.startSession(platform);
    // poll until logged_in or expired (cap ~5min)
    for (let i = 0; i < 60; i++) {
      const status = await client.sessionStatus(session.sessionId);
      if (status.status === 'logged_in') return { loggedIn: true, cookieLength: (status.cookies ?? '').length, cookies: status.cookies };
      if (status.status === 'expired' || status.status === 'error') return { loggedIn: false, status: status.status };
      await new Promise((r) => setTimeout(r, 5000));
    }
    return { loggedIn: false, status: 'timeout' };
  }
};

const authStatus: ToolDefinition = {
  name: 'auth.status',
  description: 'Validate a cookie is still logged in. Read-only.',
  inputSchema: z.object({ platform: z.enum(['douyin']), cookie: z.string() }),
  execute: async ({ platform, cookie }) => client.listVideos(platform, cookie, 1).then(
    () => ({ valid: true }), () => ({ valid: false })
  )
};

export const runtimeTools: ToolDefinition[] = [listVideos, publishVideo, checkStatus, authLogin, authStatus];

let registered = false;
export function registerRuntimeTools(): void {
  if (registered) return;
  registerToolGroup({ name: 'runtime', tools: runtimeTools });
  registered = true;
}
```
> 注：`BrowserRunnerClient` 的方法签名（`listVideos`/`publish`/`checkPublishStatus`/`startSession`/`sessionStatus`）以 `packages/growth-ops-agent/src/browser-runner-client.ts` 实际为准，按需调整字段。`shared.get_today_metrics` 第一刀可在 agent 内用 `content.list_videos` 聚合，暂不单独建 tool（YAGNI）。

- [ ] **Step 5: 实现 content-agent.ts**

`packages/runtime/src/agents/content-agent.ts`:
```ts
import type { AgentDefinition } from '../types.js';

export const contentAgent: AgentDefinition = {
  name: 'content',
  domain: 'content',
  description: '选题、内容创作、合规、改写。复用 content-writing/platform-rewrite/compliance-check skill。',
  allowedTools: ['content.list_videos', 'write_content'],
  systemPromptBuilder: (ctx) => `你是内容运营 agent，当前节点：${ctx.nodeName}。
品牌 voice：${ctx.preferences.brandVoice ?? '（未设定）'}
内容风格偏好：${ctx.preferences.contentStylePreferences ?? '（未设定）'}
避免话题：${JSON.stringify(ctx.preferences.avoidTopics ?? [])}
工作上下文：${JSON.stringify(ctx.workingMemory)}

你可以调用 content.list_videos 查看今日数据、write_content 创作内容草稿。
创作后向 supervisor 报告，不要自行发布。`
};
```

- [ ] **Step 6: 实现 publish-agent.ts**

`packages/runtime/src/agents/publish-agent.ts`:
```ts
import type { AgentDefinition } from '../types.js';

export const publishAgent: AgentDefinition = {
  name: 'publish',
  domain: 'publish',
  description: '账号认证、排期、发布、状态查询。',
  allowedTools: ['publish.video', 'publish.check_status', 'auth.login', 'auth.status'],
  mutateInference: { 'publish.video': 'Write', 'auth.login': 'Write' },
  systemPromptBuilder: (ctx) => `你是发布运营 agent，当前节点：${ctx.nodeName}。
偏好发布平台：${JSON.stringify(ctx.preferences.preferredPlatforms ?? [])}
偏好发布时间：${JSON.stringify(ctx.preferences.preferredPublishTimes ?? [])}
工作上下文：${JSON.stringify(ctx.workingMemory)}

认证节点：调 auth.login 起扫码会话；发布节点：调 publish.video（必须带 cookie + 媒体）。
每次写操作前自评 __risk 与 __confidence。`
};
```

- [ ] **Step 7: agents/index.ts + 注册 + re-export**

`packages/runtime/src/agents/index.ts`:
```ts
import { contentAgent } from './content-agent.js';
import { publishAgent } from './publish-agent.js';
import { registerRuntimeTools } from './tools.js';

// side-effect: register runtime tools into the ai-tools registry on import
registerRuntimeTools();

export function getFirstSliceAgents() {
  return { content: contentAgent, publish: publishAgent };
}
export { contentAgent, publishAgent, registerRuntimeTools };
```

在 `packages/runtime/src/index.ts` 追加：
```ts
export * from './agents/index.js';
```

> 注：在 package.json dependencies 加 `"@ai-growth-ops/growth-ops-agent": "workspace:*"`（用其 BrowserRunnerClient）。`pnpm install`。

- [ ] **Step 8: 跑测试确认通过**

```bash
pnpm install
pnpm --filter @ai-growth-ops/runtime typecheck
pnpm vitest run tests/unit/packages/runtime/content-agent.test.ts tests/unit/packages/runtime/publish-agent.test.ts
```
Expected: typecheck PASS；两个 test PASS。

- [ ] **Step 9: Commit**

```bash
git add packages/runtime/src/agents packages/runtime/src/index.ts packages/runtime/package.json tests/unit/packages/runtime/content-agent.test.ts tests/unit/packages/runtime/publish-agent.test.ts
git commit -m "feat(runtime): content-agent + publish-agent definitions + runtime tool registration

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: supervisor 状态机（5 节点 + 转移 + 智能转移）

**Files:**
- Create: `packages/runtime/src/supervisor/loop-nodes.ts`
- Create: `packages/runtime/src/supervisor/supervisor.ts`
- Create: `packages/runtime/src/supervisor/index.ts`
- Modify: `packages/runtime/src/index.ts`
- Test: `tests/unit/packages/runtime/loop-nodes.test.ts`
- Test: `tests/unit/packages/runtime/supervisor.test.ts`

**Interfaces:**
- Consumes: `LoopNode`, `NodeResult`, `NodeOutcome`, `SupervisorState`, `AgentDefinition`, `AutonomyLevel`（Task 2）；`runDomainAgent`（Task 6）；agents（Task 7）。
- Produces:
  - `FIRST_SLICE_NODES: LoopNode[]` = `['INIT','METRICS','CONTENT','PUBLISH','REVIEW']`
  - `LEGAL_TRANSITIONS: Record<LoopNode, LoopNode[]>`
  - `AGENT_FOR_NODE: Record<LoopNode, AgentDefinition | 'supervisor'>`
  - `function advance(state, result): { next: LoopNode | null; outcome: NodeOutcome }`
  - `function createSupervisor(deps): Supervisor`（`Supervisor.run(initialState, runNode)` 驱动单节点；调用方/worker 控制循环）

**转移规则（以此为准）：**
```
INIT → METRICS
METRICS → CONTENT
CONTENT → PUBLISH
PUBLISH → REVIEW
REVIEW → null (loop end)
```
`advance` 根据 `result.outcome`：
- `done` → 按 LEGAL_TRANSITIONS 取下一个；REVIEW done → next=null。
- `need_input` / `blocked` → next = 当前节点（暂停，等人），outcome 透传。
- `empty` → 仍走 LEGAL_TRANSITIONS 下一节点（第一刀无 PROSPECT skip 逻辑，empty 等同 done 推进）。

智能转移（第一刀 MVP）：第一刀**不接 LLM 转移决策**（YAGNI，固定 5 节点已足够）；LLM 智能转移 + 主动触发留到第二刀。`advance` 是纯函数确定性转移。REVIEW 节点由 supervisor 自身汇总各节点 summary（不派 agent）。

- [ ] **Step 1: 写 loop-nodes 测试（表驱动，仿现有状态机测试范式）**

`tests/unit/packages/runtime/loop-nodes.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { FIRST_SLICE_NODES, LEGAL_TRANSITIONS, AGENT_FOR_NODE, advance } from '@ai-growth-ops/runtime';
import type { NodeResult, SupervisorState } from '@ai-growth-ops/runtime';

function state(node: any): SupervisorState {
  return {
    runId: 'r', userId: 'u', orgId: 'o', autonomyLevel: 'L2_AUTOPILOT_LIGHT', dryRun: false,
    currentNode: node,
    nodeResults: { INIT: undefined, METRICS: undefined, CONTENT: undefined, PUBLISH: undefined, REVIEW: undefined },
    startedAt: '2026-06-18T00:00:00.000Z', status: 'running'
  };
}
function done(node: any): NodeResult { return { node, outcome: 'done' }; }

describe('loop nodes (first slice)', () => {
  it('defines the 5-node fixed loop', () => {
    expect(FIRST_SLICE_NODES).toEqual(['INIT', 'METRICS', 'CONTENT', 'PUBLISH', 'REVIEW']);
  });

  it.each([
    ['INIT', 'METRICS'], ['METRICS', 'CONTENT'], ['CONTENT', 'PUBLISH'], ['PUBLISH', 'REVIEW']
  ] as const)('advances %s → %s on done', (from, to) => {
    expect(advance(state(from), done(from)).next).toBe(to);
  });

  it('ends the loop after REVIEW done', () => {
    expect(advance(state('REVIEW'), done('REVIEW')).next).toBeNull();
  });

  it.each([
    ['INIT'], ['METRICS'], ['CONTENT'], ['PUBLISH']
  ] as const)('pauses on need_input at %s', (node) => {
    const r = advance(state(node), { node, outcome: 'need_input' });
    expect(r.next).toBe(node);
    expect(r.outcome).toBe('need_input');
  });

  it('dispatches INIT/PUBLISH to publish-agent, METRICS/CONTENT to content-agent, REVIEW to supervisor', () => {
    expect(AGENT_FOR_NODE.INIT.domain).toBe('publish');
    expect(AGENT_FOR_NODE.PUBLISH.domain).toBe('publish');
    expect(AGENT_FOR_NODE.METRICS.domain).toBe('content');
    expect(AGENT_FOR_NODE.CONTENT.domain).toBe('content');
    expect(AGENT_FOR_NODE.REVIEW).toBe('supervisor');
  });
});
```

- [ ] **Step 2: 跑确认失败**

```bash
pnpm vitest run tests/unit/packages/runtime/loop-nodes.test.ts
```
Expected: FAIL — 导出缺失。

- [ ] **Step 3: 实现 loop-nodes.ts**

`packages/runtime/src/supervisor/loop-nodes.ts`:
```ts
import type { AgentDefinition, LoopNode, NodeOutcome, NodeResult, SupervisorState } from '../types.js';
import { contentAgent, publishAgent } from '../agents/index.js';

export const FIRST_SLICE_NODES: LoopNode[] = ['INIT', 'METRICS', 'CONTENT', 'PUBLISH', 'REVIEW'];

export const LEGAL_TRANSITIONS: Record<LoopNode, LoopNode | null> = {
  INIT: 'METRICS',
  METRICS: 'CONTENT',
  CONTENT: 'PUBLISH',
  PUBLISH: 'REVIEW',
  REVIEW: null
};

export const AGENT_FOR_NODE: Record<LoopNode, AgentDefinition | 'supervisor'> = {
  INIT: publishAgent,      // auth handled by publish-agent
  METRICS: contentAgent,
  CONTENT: contentAgent,
  PUBLISH: publishAgent,
  REVIEW: 'supervisor'
};

export function advance(
  state: SupervisorState,
  result: NodeResult
): { next: LoopNode | null; outcome: NodeOutcome } {
  if (result.outcome === 'done' || result.outcome === 'empty') {
    return { next: LEGAL_TRANSITIONS[state.currentNode], outcome: 'done' };
  }
  // need_input / blocked → stay, await operator
  return { next: state.currentNode, outcome: result.outcome };
}
```

- [ ] **Step 4: 写 supervisor 测试**

`tests/unit/packages/runtime/supervisor.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { createSupervisor } from '@ai-growth-ops/runtime';
import type { NodeResult, SupervisorState } from '@ai-growth-ops/runtime';

function initState(node: any): SupervisorState {
  return {
    runId: 'r', userId: 'u', orgId: 'o', autonomyLevel: 'L2_AUTOPILOT_LIGHT', dryRun: true,
    currentNode: node,
    nodeResults: { INIT: undefined, METRICS: undefined, CONTENT: undefined, PUBLISH: undefined, REVIEW: undefined },
    startedAt: '2026-06-18T00:00:00.000Z', status: 'running'
  };
}

describe('Supervisor', () => {
  it('runs a single node via injected runNode and records result', async () => {
    const runNode = vi.fn(async (_state, _agent, _node) => ({ node: 'INIT', outcome: 'done', summary: 'authed' }) as NodeResult);
    const sup = createSupervisor({ runNode });
    const after = await sup.runNode(initState('INIT'));
    expect(after.nodeResults.INIT?.summary).toBe('authed');
    expect(after.currentNode).toBe('METRICS'); // advanced
  });

  it('keeps node on need_input without advancing', async () => {
    const runNode = vi.fn(async () => ({ node: 'CONTENT', outcome: 'need_input' }) as NodeResult);
    const sup = createSupervisor({ runNode });
    const after = await sup.runNode(initState('CONTENT'));
    expect(after.currentNode).toBe('CONTENT');
    expect(after.status).toBe('paused');
  });

  it('completes the loop when REVIEW returns done', async () => {
    const runNode = vi.fn(async () => ({ node: 'REVIEW', outcome: 'done', summary: 'daily report' }) as NodeResult);
    const sup = createSupervisor({ runNode });
    const after = await sup.runNode(initState('REVIEW'));
    expect(after.status).toBe('completed');
  });
});
```

- [ ] **Step 5: 跑确认失败**

```bash
pnpm vitest run tests/unit/packages/runtime/supervisor.test.ts
```
Expected: FAIL — `createSupervisor` 未导出。

- [ ] **Step 6: 实现 supervisor.ts**

`packages/runtime/src/supervisor/supervisor.ts`:
```ts
import type {
  AgentDefinition, AutonomyLevel, ConfirmationGate, LoopNode, NodeResult,
  PreferencesStore, SupervisorState, UserPreferences, WorkingMemory
} from '../types.js';
import { AGENT_FOR_NODE, advance } from './loop-nodes.js';

export interface RunNodeDeps {
  /** executes one node's agent; injected so tests can stub. Real impl calls runDomainAgent. */
  runNode: (
    state: SupervisorState,
    agent: AgentDefinition | 'supervisor',
    node: LoopNode
  ) => Promise<NodeResult>;
}

export interface Supervisor {
  runNode(state: SupervisorState): Promise<SupervisorState>;
}

export function createSupervisor(deps: RunNodeDeps): Supervisor {
  return {
    async runNode(state: SupervisorState): Promise<SupervisorState> {
      const node = state.currentNode;
      const agent = AGENT_FOR_NODE[node];
      const result = await deps.runNode(state, agent, node);
      const nodeResults = { ...state.nodeResults, [node]: result };
      const { next, outcome } = advance(state, result);
      let status: SupervisorState['status'] = 'running';
      if (next === null) status = 'completed';
      else if (outcome === 'need_input' || outcome === 'blocked') status = 'paused';
      return { ...state, nodeResults, currentNode: (next ?? node) as LoopNode, status };
    }
  };
}
```

- [ ] **Step 7: supervisor/index.ts + re-export**

`packages/runtime/src/supervisor/index.ts`:
```ts
export { FIRST_SLICE_NODES, LEGAL_TRANSITIONS, AGENT_FOR_NODE, advance } from './loop-nodes.js';
export { createSupervisor } from './supervisor.js';
export type { RunNodeDeps, Supervisor } from './supervisor.js';
```

在 `packages/runtime/src/index.ts` 追加：
```ts
export * from './supervisor/index.js';
```

- [ ] **Step 8: 跑测试确认通过**

```bash
pnpm --filter @ai-growth-ops/runtime typecheck
pnpm vitest run tests/unit/packages/runtime/loop-nodes.test.ts tests/unit/packages/runtime/supervisor.test.ts
```
Expected: 全 PASS。

- [ ] **Step 9: Commit**

```bash
git add packages/runtime/src/supervisor packages/runtime/src/index.ts tests/unit/packages/runtime/loop-nodes.test.ts tests/unit/packages/runtime/supervisor.test.ts
git commit -m "feat(runtime): supervisor state machine — 5-node fixed loop + transitions

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: BullMQ `agent.run` 队列 + handler

**Files:**
- Modify: `apps/worker/src/queue.ts`（QUEUE_NAMES 加 `AGENT_RUN: 'agent.run'`）
- Create: `apps/worker/src/job-handlers/agent.run.ts`
- Modify: `apps/worker/src/index.ts`（注册 handler）
- Test: `tests/unit/worker/agent-run-handler.test.ts`

**Interfaces:**
- Consumes: `createSupervisor`, `runDomainAgent`, `createConfirmationGate`, `createWorkingMemory`, `createPreferencesStore`（runtime）；`createDatabaseClient`（database）；`getQueue`, `registerWorker`（worker）。
- Produces: `handleAgentRun(job: Job<AgentRunJobPayload>, dbOverride?: DatabaseClient): Promise<void>`（`AgentRunJobPayload { runId?: string; task?: 'daily-agent-run' }`）。

**行为（以此为准）：**
- 读 `AgentRun`（id=runId），取 userId/orgId/agentName(=autonomyLevel 编码)/input。
- 建 `ConfirmationGate` + `WorkingMemory` + `PreferencesStore`。
- `runNode` 实现：若 agent==='supervisor'（REVIEW 节点）→ 汇总 `state.nodeResults` 的 summary 成日报，outcome='done'；否则 `runDomainAgent({agent, ...})`，把 `DomainAgentResult` 转 `NodeResult`（outcome: escalatedItems 非空 → 'need_input'，否则 'done'）。
- 循环：`while (state.status === 'running') state = await supervisor.runNode(state)`；每步 `db.agentRun.update({status, output: state})`。
- 异常 → `status:'failed', error` + throw（BullMQ 重试）。
- agent.run 不接 token；userId/orgId 从 AgentRun 反查（对齐现有 publish.execute 模式）。

- [ ] **Step 1: 写 handler 测试（stub supervisor，验证循环 + 持久化调用）**

`tests/unit/worker/agent-run-handler.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
// handler is tested by injecting a fake supervisor factory; see implementation note below.
// Minimal smoke: module loads and exports handleAgentRun.
describe('agent.run handler', () => {
  it('exports handleAgentRun', async () => {
    const mod = await import('../../apps/worker/src/job-handlers/agent.run.js');
    expect(typeof mod.handleAgentRun).toBe('function');
  });
});
```
> 注：完整循环测试在 Task 11 集成测试覆盖（需 DB + Redis）。单元层只验证模块加载 + 签名，避免在 unit 层拉起 BullMQ。

- [ ] **Step 2: 跑确认失败**

```bash
pnpm vitest run tests/unit/worker/agent-run-handler.test.ts
```
Expected: FAIL — 模块不存在。

- [ ] **Step 3: queue.ts 加队列名**

在 `apps/worker/src/queue.ts` 的 `QUEUE_NAMES` 对象追加：
```ts
  AGENT_RUN: 'agent.run'
```
（同步更新 `QueueName` 类型联合，若存在。）

- [ ] **Step 4: 实现 agent.run.ts**

`apps/worker/src/job-handlers/agent.run.ts`:
```ts
import type { Job } from 'bullmq';
import { createDatabaseClient, type DatabaseClient } from '@ai-growth-ops/database';
import {
  createSupervisor, runDomainAgent, createConfirmationGate, createWorkingMemory,
  createPreferencesStore, contentAgent, publishAgent,
  type AgentDefinition, type LoopNode, type NodeResult, type SupervisorState
} from '@ai-growth-ops/runtime';
import { AGENT_FOR_NODE } from '@ai-growth-ops/runtime';

const AGENT_REGISTRY: Record<string, AgentDefinition> = { content: contentAgent, publish: publishAgent };

export interface AgentRunJobPayload { runId?: string; task?: 'daily-agent-run' }

function autonomyFromRun(run: { agentName: string }): SupervisorState['autonomyLevel'] {
  if (run.agentName.startsWith('L3')) return 'L3_FULL_AUTOPILOT';
  if (run.agentName.startsWith('L1')) return 'L1_COPILOT';
  return 'L2_AUTOPILOT_LIGHT';
}

export async function handleAgentRun(job: Job<AgentRunJobPayload>, dbOverride?: DatabaseClient): Promise<void> {
  const db = dbOverride ?? createDatabaseClient();

  // Resolve runId: explicit (manual API) or create one for the daily scheduled run.
  let runId = job.data.runId;
  if (!runId) {
    const admin = await db.user.findFirst({ where: { email: process.env.ADMIN_EMAIL || 'admin@ai-growth-ops.local' } });
    const org = await db.organization.findFirst();
    if (!admin || !org) throw new Error('daily run needs an admin user + organization (seed first)');
    const created = await db.agentRun.create({
      data: { organizationId: org.id, userId: admin.id, agentName: 'L2_AUTOPILOT_LIGHT', status: 'pending', input: { dryRun: false } }
    });
    runId = created.id;
  }

  const run = await db.agentRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`AgentRun ${runId} not found`);

  const autonomyLevel = autonomyFromRun(run);
  const gate = createConfirmationGate();
  const workingMemory = createWorkingMemory();
  const preferences = createPreferencesStore(db, run.organizationId);

  const buildRunNode = (state: SupervisorState) => async (
    _s: SupervisorState, agent: AgentDefinition | 'supervisor', node: LoopNode
  ): Promise<NodeResult> => {
    if (agent === 'supervisor') {
      const summaries = Object.values(state.nodeResults)
        .filter((r): r is NonNullable<typeof r> => !!r)
        .map((r) => `- ${r.node}: ${r.summary ?? '(no summary)'}`)
        .join('\n');
      return { node, outcome: 'done', summary: `每日运营复盘：\n${summaries}` };
    }
    const prefs = await preferences.forDomain(run.userId, agent.domain as any);
    const result = await runDomainAgent({
      agent, userId: run.userId, orgId: run.organizationId, nodeName: node,
      task: `执行 ${node} 节点任务`, autonomyLevel, dryRun: autonomyLevel === 'L1_COPILOT' ? false : (run.input as any)?.dryRun ?? false,
      workingMemory, preferences: prefs, confirmationGate: gate, maxSteps: 8
    });
    const outcome = result.escalatedItems.length > 0 ? 'need_input' : 'done';
    return {
      node, outcome,
      summary: result.finalText.slice(0, 500),
      escalatedItems: result.escalatedItems
    };
  };

  let state: SupervisorState = {
    runId, userId: run.userId, orgId: run.organizationId,
    autonomyLevel, dryRun: false, currentNode: 'INIT',
    nodeResults: { INIT: undefined, METRICS: undefined, CONTENT: undefined, PUBLISH: undefined, REVIEW: undefined },
    startedAt: new Date().toISOString(), status: 'running'
  };
  await db.agentRun.update({ where: { id: runId }, data: { status: 'running', startedAt: new Date() } });

  try {
    let supervisor = createSupervisor({ runNode: buildRunNode(state) });
    let guard = 0;
    while (state.status === 'running' && guard++ < 10) {
      supervisor = createSupervisor({ runNode: buildRunNode(state) });
      state = await supervisor.runNode(state);
      await db.agentRun.update({ where: { id: runId }, data: { output: state as any, status: mapStatus(state.status) } });
    }
    await db.agentRun.update({ where: { id: runId }, data: { status: mapStatus(state.status), finishedAt: new Date() } });
  } catch (err) {
    await db.agentRun.update({ where: { id: runId }, data: { status: 'failed', error: String(err), finishedAt: new Date() } });
    throw err;
  } finally {
    if (!dbOverride) await db.$disconnect();
  }
}

function mapStatus(s: SupervisorState['status']): string {
  return s === 'completed' ? 'success' : s === 'failed' ? 'failed' : 'running';
}
```
> 注：AgentRun.status 是裸 String，值用 `running/success/failed/paused`（不用现有 enum，避免迁移）。`AGENT_FOR_NODE` 已 re-export，确保 runtime/index.ts 导出。`run.input` 存 dryRun 等参数。

- [ ] **Step 5: 在 worker index.ts 注册 handler**

`apps/worker/src/index.ts`：import `handleAgentRun`，在 `realHandlers` Record 加：
```ts
[QUEUE_NAMES.AGENT_RUN]: handleAgentRun,
```

- [ ] **Step 6: 跑测试确认通过**

```bash
pnpm --filter @ai-growth-ops/worker typecheck || true
pnpm vitest run tests/unit/worker/agent-run-handler.test.ts
```
Expected: smoke test PASS。typecheck 若 worker 无独立 typecheck script 可跳过。

- [ ] **Step 7: 注册每日自动运行 repeat job（被动定时触发）**

在 `apps/worker/src/scheduler.ts` 的 `startScheduler()` 里追加（对齐现有 repeat job 模式，jobId 去重）：
```ts
const agentQueue = getQueue('agent.run');
await agentQueue.add('daily-agent-run', { task: 'daily-agent-run' }, {
  repeat: { every: 86_400_000 },
  jobId: 'agent-daily-run-repeat'
});
```
第一刀：定时为默认 admin/org 创建 AgentRun（handler 已在 Step 4 处理 `task === 'daily-agent-run'` 分支）。多租户自动运行配置（per-org enable + 自定义 cron）留第二刀。

- [ ] **Step 8: Commit**

```bash
git add apps/worker/src/queue.ts apps/worker/src/job-handlers/agent.run.ts apps/worker/src/index.ts apps/worker/src/scheduler.ts tests/unit/worker/agent-run-handler.test.ts
git commit -m "feat(worker): agent.run queue + handler + daily scheduled run

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Workbench API（触发 agent run + 查状态）

**Files:**
- Modify: `apps/api/src/routes.ts`（加 2 条路由）
- Test: `tests/integration/runtime/agent-run-api.test.ts`

**Interfaces:**
- Consumes: `routeRequest` 路由模式 `{method, pattern, handler}`；`getOrganizationContext`（鉴权）；`getQueue` from `apps/worker/src/queue.ts`（或直接 `new Queue`）。
- Produces: `POST /api/agent/runs`（创建 AgentRun + 入队）、`GET /api/agent/runs/:id`（查状态）。

**行为（以此为准）：**
- `POST /api/agent/runs`：鉴权 → `db.agentRun.create({ data: { organizationId, userId, agentName: autonomyLevel, status:'pending', input: { dryRun } } })` → `new Queue('agent.run').add('agent-run', { runId }, { attempts:2, backoff:{type:'exponential',delay:10000} })` → 200 `{ runId }`。
- `GET /api/agent/runs/:id`：鉴权 + 校验 org 归属 → 返回 `{ id, status, currentNode, nodeResults, startedAt, finishedAt, error }`。

- [ ] **Step 1: 写集成测试**

`tests/integration/runtime/agent-run-api.test.ts`:
```ts
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createDatabaseClient, resetDatabase, seedDatabase, type DatabaseClient } from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src/server';
import type { Server } from 'node:http';

describe('agent run API (integration)', () => {
  let db: DatabaseClient; let server: Server; let base: string; let token: string;

  beforeAll(async () => {
    db = createDatabaseClient();
    await resetDatabase(db);
    await seedDatabase(db);
    server = await createApiServer({ db, port: 0 });
    base = `http://127.0.0.1:${(server.address() as any).port}`;
    // obtain a real session token via /api/auth/login (admin@ai-growth-ops.local / changeme123)
    const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@ai-growth-ops.local', password: 'changeme123' }) });
    token = (await r.json()).token;
  });
  afterAll(async () => { server.close(); await db.$disconnect(); });

  it('POST /api/agent/runs creates an AgentRun and returns runId', async () => {
    const r = await fetch(`${base}/api/agent/runs`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ autonomyLevel: 'L2_AUTOPILOT_LIGHT', dryRun: true })
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.runId).toBeTruthy();
  });
});
```
> 注：`createApiServer` 签名 + auth login 返回 shape 以 `apps/api/src/server.ts`/`routes-auth.ts` 实际为准调整。GET 测试在 create 后查同 id 补一条。

- [ ] **Step 2: 跑确认失败**

```bash
pnpm vitest run tests/integration/runtime/agent-run-api.test.ts
```
Expected: FAIL — 404（路由不存在）。

- [ ] **Step 3: 在 routes.ts 加路由**

在 `apps/api/src/routes.ts` 的路由数组追加（紧跟现有 `// ── Workflows ──` 区块之后，对齐现有 `{method, pattern, handler}` 形状）：
```ts
{
  method: 'POST',
  pattern: '/api/agent/runs',
  handler: async (req, res, ctx) => {
    const orgCtx = await getOrganizationContext(req, ctx.db);
    if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
    const body = (ctx.body ?? {}) as { autonomyLevel?: string; dryRun?: boolean };
    const autonomy = body.autonomyLevel ?? 'L2_AUTOPILOT_LIGHT';
    const run = await ctx.db.agentRun.create({
      data: {
        organizationId: orgCtx.organization.id,
        userId: orgCtx.user.id,
        agentName: autonomy,
        status: 'pending',
        input: { dryRun: body.dryRun ?? false }
      }
    });
    const { Queue } = await import('bullmq');
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const queue = new Queue('agent.run', { connection: { url: redisUrl } });
    await queue.add('agent-run', { runId: run.id }, { attempts: 2, backoff: { type: 'exponential', delay: 10000 } });
    await queue.close();
    sendJson(res, 200, { runId: run.id });
  }
},
{
  method: 'GET',
  pattern: '/api/agent/runs/:id',
  handler: async (req, res, ctx) => {
    const orgCtx = await getOrganizationContext(req, ctx.db);
    if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
    const run = await ctx.db.agentRun.findFirst({ where: { id: ctx.params.id, organizationId: orgCtx.organization.id } });
    if (!run) return sendJson(res, 404, { error: 'run not found' });
    const state = (run.output ?? {}) as Record<string, unknown>;
    sendJson(res, 200, {
      id: run.id, status: run.status,
      currentNode: state.currentNode ?? null,
      nodeResults: state.nodeResults ?? {},
      startedAt: run.startedAt, finishedAt: run.finishedAt, error: run.error
    });
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm vitest run tests/integration/runtime/agent-run-api.test.ts
```
Expected: PASS。补一条 GET 测试验证 200 + runId 回读。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes.ts tests/integration/runtime/agent-run-api.test.ts
git commit -m "feat(api): Workbench API — trigger + query agent runs

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: 端到端集成测试（内容→发布闭环，dry-run）

**Files:**
- Test: `tests/integration/runtime/content-publish-loop.test.ts`

**Interfaces:**
- Consumes: 全栈（API + worker handler + supervisor + agents + gate）。

**行为：** 启动 API server + 直接调 `handleAgentRun`（绕过 BullMQ，测试可控）+ mock LLM client + mock browser-runner（dry-run 不真发）。验证：5 节点依次推进、PUBLISH 节点 dry-run 拦截、REVIEW 汇总、AgentRun.status='success'、nodeResults 5 条全有 summary。

- [ ] **Step 1: 写 E2E 测试**

`tests/integration/runtime/content-publish-loop.test.ts`:
```ts
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createDatabaseClient, resetDatabase, seedDatabase, type DatabaseClient } from '@ai-growth-ops/database';
import { handleAgentRun } from '../../../apps/worker/src/job-handlers/agent.run.js';

describe('content→publish loop (dry-run, integration)', () => {
  let db: DatabaseClient; let runId: string;

  beforeAll(async () => {
    db = createDatabaseClient();
    await resetDatabase(db);
    await seedDatabase(db);
    const admin = await db.user.findFirst({ where: { email: 'admin@ai-growth-ops.local' } });
    const org = await db.organization.findFirst();
    const run = await db.agentRun.create({
      data: {
        organizationId: org!.id,
        userId: admin!.id,
        agentName: 'L2_AUTOPILOT_LIGHT',  // L2 + dryRun:true → gate simulates ALL tool calls (reads+writes) as blocked-but-NOT-escalated → escalatedItems empty → outcome 'done' every node → loop completes all 5 nodes with no real side effects
        status: 'pending',
        input: { dryRun: true }
      }
    });
    runId = run.id;
  });
  afterAll(async () => { await db.$disconnect(); });

  it('runs all 5 nodes to completion and records summaries', async () => {
    // NOTE: requires LLM + browser-runner env; in CI set OPENAI_API_KEY stub + BROWSER_RUNNER mock.
    // For dry-run L1, writes are escalated (not executed), so no real browser calls for publish.
    await handleAgentRun({ data: { runId } } as any, db);
    const run = await db.agentRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('success');
    const state = run?.output as any;
    expect(Object.keys(state.nodeResults).filter((k) => state.nodeResults[k])).toHaveLength(5);
    expect(state.currentNode).toBe('REVIEW');
  }, 120_000);
});
```
> 注：dry-run 模式下 gate 拦截所有 tool call（读+写都返回 `simulatedOutput`、不执行、不 escalate），所以 5 节点全部 `outcome='done'`、闭环走完、无真实副作用、**不需要 browser-runner**。但仍需真实 LLM（agent 要跑 LLM loop 决定调哪些 tool）：env `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`，否则 `it.skipIf(!process.env.OPENAI_API_KEY)` 跳过。第一刀验收：本地手跑通过即视为闭环成立。（注意：若用 L1，每次写都会 escalate→`need_input`→loop pause，不会走完 5 节点——所以必须用 L2+dryRun 才能验证完整闭环。）

- [ ] **Step 2: 跑测试**

```bash
pnpm docker:up   # postgres + redis
pnpm db:push
# ensure browser-runner running in another terminal: pnpm dev:browser-runner
# ensure LLM env set
pnpm vitest run tests/integration/runtime/content-publish-loop.test.ts
```
Expected: PASS（5 节点全完成，status=success）。若 LLM/browser-runner 不可用，本地至少验证逻辑路径，CI 用 skipIf 标记。

- [ ] **Step 3: Commit**

```bash
git add tests/integration/runtime/content-publish-loop.test.ts
git commit -m "test(runtime): e2e content→publish loop (dry-run, 5 nodes)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: 架构守卫强化 + 文档 + 旧资产清理（增量收尾）

**Files:**
- Modify: `scripts/check-architecture-drift.ts`（补规则）
- Create: `docs/superpowers/runbooks/agent-runtime-runbook.md`
- Modify: `README.md`（架构总览段）
- Test: 复跑 `pnpm test:architecture`

**行为：**
- 守卫补：`no-runtime-depends-on-apps`（Task 1 已加，此处确认生效）+ warn 规则提示旧 `workflow.execute`/`execute_plan` 迁移到 agent.run（已有 `legacy-workflow-queue`，无需新增）。
- runbook：如何启动（api + worker + browser-runner + docker）、如何触发 agent run（curl 示例）、如何查状态、dry-run 用法、自主等级切换。
- README 架构段：6 层架构图（引用 spec）+ 第一刀范围说明。
- **不删**旧 ai-tools 53 tool / growth-ops-agent 9 tool / workflow.execute（增量迁移，第二刀验证后再删——本 task 只做不破坏现状的文档与守卫）。

- [ ] **Step 1: 写 runbook**

`docs/superpowers/runbooks/agent-runtime-runbook.md`：包含启动顺序、env 清单、`curl -X POST /api/agent/runs` 触发示例、`GET /api/agent/runs/:id` 轮询、dry-run 与自主等级说明、常见故障（browser-runner 不可达 / cookie 失效 / LLM 超时）排查。

- [ ] **Step 2: 更新 README 架构段**

在 `README.md` 加 `## Architecture` 段，引用 spec 路径 + 6 层简图 + 第一刀范围 + 指向 runbook。

- [ ] **Step 3: 复跑全套验收**

```bash
pnpm lint
pnpm test:unit
pnpm test:architecture
pnpm test:integration   # 需 docker + env
pnpm --filter @ai-growth-ops/runtime build
```
Expected: 全绿（lint 无 error；unit/architecture/integration PASS；runtime build 产物生成）。

- [ ] **Step 4: Commit**

```bash
git add scripts/check-architecture-drift.ts docs/superpowers/runbooks/agent-runtime-runbook.md README.md
git commit -m "docs(runtime): runbook + README architecture overview; guard hardening

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 交付标准验收（对应 spec 质量门）

完成 Task 1–12 后，逐项核对：
- [ ] 可测试：runtime 单测覆盖（gate/memory/tool-access/loop-nodes/supervisor/agents）+ 集成（preferences/api/e2e loop）全绿。
- [ ] 健壮性：gate 拦截写操作、AgentRun 状态持久化、handler 异常 → failed + BullMQ 重试、worker 并发不变。
- [ ] 可观测：AgentRun.output 存完整 SupervisorState（节点/结果/escalatedItems）；SkillRun token 追踪沿用；handler 每步 update。
- [ ] 安全：gate 双层（agent __risk/__confidence + gate 硬决策）；cookie 仅在 tool executor 内、不进 system prompt/LLM。
- [ ] 可回滚：dry-run 模式（L1 + input.dryRun）拦截所有写；state 可重放（从 AgentRun.output 重建）。
- [ ] 文档：runbook + README + spec 三者一致。
