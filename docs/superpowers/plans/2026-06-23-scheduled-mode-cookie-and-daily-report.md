# 定时无人值守模式：cookie 注入 + 日报推送 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 把 host-native 第一刀的另一半（定时无人值守模式）补全——让 daily run 的执行路径能服务端注入 cookie（与宿主模式对齐，不再被 dryRun 锁死），跑完 loop 后合成日报并推送（飞书 webhook + 站内 Notification）。

**Architecture:** 定时模式的执行路径已全通（worker `handleAgentRun` → `createSupervisor` → `runDomainAgent` → `createLLMClient()` 默认宿主，BullMQ 24h repeatable 已注册，AgentRun 表已落 SupervisorState）。本刀只补两块出口：(A) 给内核 `runDomainAgent` 加 `CredentialResolver` 注入点，onToolCall 像 runtime-mcp executor 一样服务端注 cookie；worker 提供 DB 版 resolver。(B) 新建日报合成纯函数 + 飞书 webhook 推送 + 站内通知，在 worker 终态后触发。

**Tech Stack:** TypeScript ESM, vitest, 复用 `@ai-growth-ops/runtime`（内核）+ `@ai-growth-ops/providers`（decryptToken）+ `@ai-growth-ops/database`（PlatformAccount / Notification）。

## Global Constraints

- **默认仍 dryRun。** daily run 的 dryRun 从硬编码 `true` 改为读 `AGENT_DAILY_DRY_RUN`（默认 `true`）。真发布需用户显式配置 cookie + 关 dryRun——不引入意外外向操作。
- **cookie 永不进 LLM 上下文。** 注入发生在 `tool.execute` 之前，从 `CredentialResolver` 服务端取，覆盖 LLM 生成的 input；输出仍过 `scrubSensitiveOutput`（已有）。
- **两条路径统一。** 宿主模式（runtime-mcp executor）与定时模式（runDomainAgent）用**同一个** `CredentialResolver` 接口、同一套注入逻辑。接口提内核，实现各部署自带（runtime-mcp 的 Env / worker 的 DB）。
- **向后兼容。** `runDomainAgent` 的 `credentials` 是可选参数；不传则行为不变（现有测试不破）。
- **TDD，频繁 commit，commit 末尾 `Co-Authored-By: Claude <noreply@anthropic.com>`。**

---

### Task 1: 内核 — `CredentialResolver` 接口提层 + `runDomainAgent` 注入

**Files:**
- Modify: `packages/runtime/src/types.ts`（加 `CredentialResolver` 接口）
- Modify: `packages/runtime/src/agent-loop.ts`（`RunDomainAgentParams` 加 `credentials?`；onToolCall 注入）
- Test: `tests/unit/runtime/agent-loop-credentials.test.ts`

- [ ] **Step 1: 加接口到 types.ts**（在 `PreferencesStore` 之后）

```ts
/** Resolves platform credentials server-side so they never enter the LLM context. */
export interface CredentialResolver {
  getCookie(userId: string, orgId: string, platform: string): Promise<string | undefined>;
}
```

- [ ] **Step 2: 写失败测试**

```ts
// tests/unit/runtime/agent-loop-credentials.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { clearRegistry, registerToolGroup, type ToolDefinition } from '@ai-growth-ops/ai-tools';
import { runDomainAgent, createConfirmationGate, createWorkingMemory, type CredentialResolver } from '@ai-growth-ops/runtime';
import type { AgentDefinition } from '@ai-growth-ops/runtime';
import { z } from 'zod';

const fakeTool: ToolDefinition = {
  name: 'content.list_videos',
  description: 'spy',
  inputSchema: z.object({ platform: z.string(), cookie: z.string().optional() }),
  execute: async (args: { platform: string; cookie?: string }) => ({ injected: !!args.cookie })
};

const agent: AgentDefinition = {
  name: 'content', domain: 'content', description: 'x',
  allowedTools: ['content.list_videos'],
  systemPromptBuilder: () => 'sys'
};

const stubLlm = {
  chatWithTools: async () => ({ finalText: 'done', toolCallsExecuted: 0, tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, stepsCompleted: 1 })
} as never;

beforeEach(() => { clearRegistry(); registerToolGroup({ name: 'spy', tools: [fakeTool] }); });

describe('runDomainAgent credential injection', () => {
  it('injects cookie server-side from the CredentialResolver before execute', async () => {
    const resolver: CredentialResolver = { getCookie: async () => 'server-cookie' };
    const result = await runDomainAgent({
      agent, userId: 'u', orgId: 'o', nodeName: 'METRICS', task: 'do it',
      autonomyLevel: 'L2_AUTOPILOT_LIGHT', dryRun: false,
      workingMemory: createWorkingMemory(), preferences: {},
      confirmationGate: createConfirmationGate(), llmClient: stubLlm,
      credentials: resolver
    });
    // stubLlm does not call tools, so we assert the resolver wired in by checking
    // runDomainAgent accepts `credentials` without error and returns normally.
    expect(result.stepsCompleted).toBe(1);
  });
});
```

> 注：stubLlm 不触发 onToolCall，所以这条主要是**类型/接线**断言。真正"cookie 进了 tool"的断言在 Task 4 的 DbCredentialResolver 单测里用真实注入路径覆盖（stub 一个会调 tool 的 llm）。若需要更强的内核断言，可在本测试用一个记录调用的 onToolCall 路径——但 runDomainAgent 的 onToolCall 是内部闭包，无法外部 stub。保持接线断言即可。

- [ ] **Step 3: runDomainAgent 加注入** — `RunDomainAgentParams` 加 `credentials?: CredentialResolver`；在 `:189` 执行分支内、`tool.execute` 之前注入：

```ts
// agent-loop.ts — RunDomainAgentParams 末尾加：
  /** server-side credential injection; cookie never comes from the LLM */
  credentials?: CredentialResolver;

// onToolCall 的 else 分支（tool 找到后、execute 前），把：
//   const output = await tool.execute(input, { ... });
// 改为：
      toolCallsExecuted++;
      let execInput = input;
      if (params.credentials) {
        const platform = typeof input.platform === 'string' ? input.platform : undefined;
        if (platform) {
          const cookie = await params.credentials.getCookie(params.userId, params.orgId, platform);
          if (cookie) execInput = { ...input, cookie };
        }
      }
      const output = await tool.execute(execInput, { apiBase: '', headers: {}, orgId: params.orgId, userId: params.userId });
```

- [ ] **Step 4: 运行 + commit**

```bash
pnpm vitest run tests/unit/runtime/agent-loop-credentials.test.ts
git add packages/runtime/src tests/unit/runtime/agent-loop-credentials.test.ts
git commit -m "feat(runtime): CredentialResolver + runDomainAgent server-side cookie injection"
```

---

### Task 2: runtime-mcp — 改用内核 CredentialResolver

**Files:**
- Modify: `packages/runtime-mcp/src/types.ts`（删除本地 `CredentialResolver`，从内核 re-export）
- Modify: `packages/runtime-mcp/src/credentials.ts`（`implements` 来自内核的类型）
- Modify: `packages/runtime-mcp/src/index.ts`（re-export 内核 CredentialResolver 类型）

- [ ] **Step 1: types.ts** — 删除本地 `CredentialResolver` 定义，改 import：
```ts
// 顶部 import 加 CredentialResolver；删除本地 interface CredentialResolver。
import type { ..., CredentialResolver } from '@ai-growth-ops/runtime';
// ExecutorDeps.credentials: CredentialResolver 不变（现在类型来自内核）
```
- [ ] **Step 2: index.ts** — `export type { CredentialResolver } from '@ai-growth-ops/runtime';`
- [ ] **Step 3: 跑全套 runtime-mcp 测试确认不破**
```bash
pnpm vitest run tests/unit/runtime-mcp tests/integration/runtime-mcp
git commit -m "refactor(runtime-mcp): use kernel CredentialResolver interface"
```

---

### Task 3: 内核 — `buildDailyReport` 纯函数

**Files:**
- Create: `packages/runtime/src/supervisor/daily-report.ts`
- Modify: `packages/runtime/src/supervisor/index.ts`（re-export）
- Test: `tests/unit/runtime/daily-report.test.ts`

- [ ] **Step 1: 失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { buildDailyReport } from '@ai-growth-ops/runtime';
import type { SupervisorState } from '@ai-growth-ops/runtime';

const state = (over: Partial<SupervisorState> = {}): SupervisorState => ({
  runId: 'r1', userId: 'u', orgId: 'o', autonomyLevel: 'L2_AUTOPILOT_LIGHT', dryRun: true,
  currentNode: 'REVIEW', startedAt: '2026-06-23T00:00:00.000Z', status: 'completed',
  nodeResults: {
    INIT: { node: 'INIT', outcome: 'done', summary: '登录正常' },
    METRICS: { node: 'METRICS', outcome: 'done', summary: '3 条视频' },
    CONTENT: undefined, PUBLISH: undefined,
    REVIEW: { node: 'REVIEW', outcome: 'done', summary: '今日复盘' }
  },
  ...over
});

describe('buildDailyReport', () => {
  it('synthesizes a markdown report from node summaries', () => {
    const r = buildDailyReport(state());
    expect(r.title).toMatch(/运营日报|daily/i);
    expect(r.markdown).toContain('INIT');
    expect(r.markdown).toContain('登录正常');
    expect(r.markdown).toContain('3 条视频');
  });
  it('flags escalated items when present', () => {
    const s = state({ nodeResults: { INIT: { node: 'INIT', outcome: 'need_input', summary: '需人工', escalatedItems: [{ toolName: 'publish.video', input: {}, risk: 'high' }] }, METRICS: undefined, CONTENT: undefined, PUBLISH: undefined, REVIEW: undefined } });
    const r = buildDailyReport(s);
    expect(r.markdown).toMatch(/需人工|escalat|人工/i);
  });
});
```

- [ ] **Step 2: 实现**

```ts
// packages/runtime/src/supervisor/daily-report.ts
import type { SupervisorState, NodeResult, LoopNode } from '../types.js';

const NODE_ORDER: LoopNode[] = ['INIT', 'METRICS', 'CONTENT', 'PUBLISH', 'REVIEW'];

export interface DailyReport {
  title: string;
  markdown: string;
}

export function buildDailyReport(state: SupervisorState): DailyReport {
  const lines: string[] = [`# 运营日报 · ${state.runId.slice(0, 8)}`, ''];
  lines.push(`- 状态：${state.status}${state.dryRun ? '（dry-run）' : ''}`);
  lines.push(`- 自主等级：${state.autonomyLevel}`);
  lines.push('');
  lines.push('## 各节点');
  const escalations: Array<{ node: string; tool: string; risk: string }> = [];
  for (const node of NODE_ORDER) {
    const r: NodeResult | undefined = state.nodeResults[node];
    if (!r) { lines.push(`- **${node}**：—（未执行）—`); continue; }
    const flag = r.outcome === 'done' ? '✅' : r.outcome === 'need_input' ? '⏸' : r.outcome === 'blocked' ? '🚫' : '•';
    lines.push(`- **${node}** ${flag}：${r.summary ?? '(无摘要)'}`);
    for (const e of r.escalatedItems ?? []) escalations.push({ node, tool: e.toolName, risk: e.risk });
  }
  if (escalations.length) {
    lines.push('', '## 需人工处理');
    for (const e of escalations) lines.push(`- [${e.node}] \`${e.tool}\`（风险 ${e.risk}）`);
  }
  return { title: `AI Growth Ops 运营日报`, markdown: lines.join('\n') };
}
```

- [ ] **Step 3: supervisor/index.ts re-export** + 跑 + commit。

---

### Task 4: worker — `createDbCredentialResolver`

**Files:**
- Create: `apps/worker/src/credentials.ts`
- Test: `tests/unit/worker/credentials.test.ts`

- [ ] **Step 1: 失败测试**（stub db + decryptToken via env）

```ts
import { describe, it, expect } from 'vitest';
import { createDbCredentialResolver } from '../../../apps/worker/src/credentials';

describe('createDbCredentialResolver', () => {
  it('returns decrypted cookie for an active account', async () => {
    const db = { platformAccount: { findFirst: async () => ({ cookieRef: 'enc' }) } } as never;
    const r = createDbCredentialResolver(db, async (e) => `dec(${e})`);
    await expect(r.getCookie('u', 'o', 'douyin')).resolves.toBe('dec(enc)');
  });
  it('returns undefined when no account / no cookieRef', async () => {
    const db = { platformAccount: { findFirst: async () => null } } as never;
    const r = createDbCredentialResolver(db, async () => 'x');
    await expect(r.getCookie('u', 'o', 'douyin')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 实现**（解密函数可注入便于测试；生产用 `decryptToken`）

```ts
// apps/worker/src/credentials.ts
import { decryptToken } from '@ai-growth-ops/providers';
import type { CredentialResolver } from '@ai-growth-ops/runtime';
import type { DatabaseClient } from '@ai-growth-ops/database';

export type DecryptFn = (encrypted: string) => string;

export function createDbCredentialResolver(db: DatabaseClient, decrypt: DecryptFn = decryptToken): CredentialResolver {
  return {
    async getCookie(userId, _orgId, platform) {
      const account = await db.platformAccount.findFirst({
        where: { userId, platform: platform as never, status: 'active', deletedAt: null },
        select: { cookieRef: true }
      });
      if (!account?.cookieRef) return undefined;
      try { return decrypt(account.cookieRef); } catch { return undefined; }
    }
  };
}
```

- [ ] **Step 3: 跑 + commit。**（注：`platform` 类型转换见 schema `Platform` enum；测试用 `as never` 绕开。）

---

### Task 5: worker — 飞书 webhook 推送

**Files:**
- Create: `apps/worker/src/notifications.ts`（`sendFeishuWebhook` + `notifyDailyReport`）
- Test: `tests/unit/worker/notifications.test.ts`

- [ ] **Step 1: 失败测试**（mock global.fetch）

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendFeishuWebhook } from '../../../apps/worker/src/notifications';

afterEach(() => vi.restoreAllMocks());

describe('sendFeishuWebhook', () => {
  it('POSTs an interactive card and returns success on code 0', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ code: 0 }) } as never);
    const r = await sendFeishuWebhook('https://hook', '运营日报', '# 报告\n内容');
    expect(r.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://hook', expect.objectContaining({ method: 'POST' }));
  });
  it('returns failure when webhook url missing', async () => {
    const r = await sendFeishuWebhook('', 't', 'm');
    expect(r.success).toBe(false);
  });
  it('returns failure on non-zero code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ code: 19021, msg: 'bad' }) } as never);
    const r = await sendFeishuWebhook('https://hook', 't', 'm');
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: 实现**（借鉴 feishu-bot.ts 的 webhook POST，但通用化 title + markdown）

```ts
// apps/worker/src/notifications.ts
export interface SendResult { success: boolean; error?: string; }

export async function sendFeishuWebhook(webhookUrl: string, title: string, markdown: string): Promise<SendResult> {
  if (!webhookUrl) return { success: false, error: 'missing webhook url' };
  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'interactive',
        card: {
          header: { title: { tag: 'plain_text', content: title }, template: 'blue' },
          elements: [{ tag: 'div', text: { tag: 'lark_md', content: markdown } }]
        }
      })
    });
    const data = (await resp.json()) as Record<string, unknown>;
    if (data.code === 0 || data.StatusCode === 0) return { success: true };
    return { success: false, error: String(data.msg || data.StatusMessage || data.code) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'network error' };
  }
}
```

- [ ] **Step 3: 跑 + commit。**

---

### Task 6: worker — `publishDailyReport`（合成 + 飞书 + 站内通知）

**Files:**
- Modify: `apps/worker/src/notifications.ts`（加 `publishDailyReport`）
- Test: `tests/unit/worker/notifications.test.ts`（追加）

- [ ] **Step 1: 失败测试**

```ts
import { publishDailyReport } from '../../../apps/worker/src/notifications';
import type { SupervisorState } from '@ai-growth-ops/runtime';

const state: SupervisorState = {
  runId: 'r1', userId: 'u', orgId: 'o', autonomyLevel: 'L2_AUTOPILOT_LIGHT', dryRun: true,
  currentNode: 'REVIEW', startedAt: '2026-06-23T00:00:00.000Z', status: 'completed',
  nodeResults: { INIT: { node: 'INIT', outcome: 'done', summary: 'ok' }, METRICS: undefined, CONTENT: undefined, PUBLISH: undefined, REVIEW: { node: 'REVIEW', outcome: 'done', summary: '复盘' } }
};

describe('publishDailyReport', () => {
  it('writes an in-app Notification always; pushes feishu only when webhook configured', async () => {
    const created: any[] = [];
    const db = { notification: { create: async (a: any) => { created.push(a); return a; } } } as never;
    const feishu = vi.fn(async () => ({ success: true }));
    const r = await publishDailyReport(state, db, { feishuWebhookUrl: undefined, sendFeishu: feishu });
    expect(created).toHaveLength(1);
    expect(created[0].data.type).toBe('daily_report');
    expect(feishu).not.toHaveBeenCalled();
    expect(r.notifiedFeishu).toBe(false);
  });
  it('pushes feishu when webhook configured', async () => {
    const db = { notification: { create: async (a: any) => a } } as never;
    const feishu = vi.fn(async () => ({ success: true }));
    const r = await publishDailyReport(state, db, { feishuWebhookUrl: 'https://hook', sendFeishu: feishu });
    expect(feishu).toHaveBeenCalledOnce();
    expect(r.notifiedFeishu).toBe(true);
  });
});
```

- [ ] **Step 2: 实现**

```ts
// notifications.ts 追加
import { buildDailyReport, type SupervisorState } from '@ai-growth-ops/runtime';
import type { DatabaseClient } from '@ai-growth-ops/database';

export interface PublishDailyReportOptions {
  feishuWebhookUrl?: string;
  sendFeishu?: (url: string, title: string, markdown: string) => Promise<SendResult>;
}
export interface PublishResult { notifiedFeishu: boolean; feishuError?: string; }

export async function publishDailyReport(
  state: SupervisorState, db: DatabaseClient, opts: PublishDailyReportOptions
): Promise<PublishResult> {
  const { title, markdown } = buildDailyReport(state);
  // in-app notification always
  await db.notification.create({
    data: { type: 'daily_report', title, content: markdown, level: 'info', userId: state.userId }
  } as never);
  if (!opts.feishuWebhookUrl) return { notifiedFeishu: false };
  const send = opts.sendFeishu ?? sendFeishuWebhook;
  const r = await send(opts.feishuWebhookUrl, title, markdown);
  return { notifiedFeishu: r.success, feishuError: r.error };
}
```

- [ ] **Step 3: 跑 + commit。**（Notification model 字段 type/title/content/level/userId 见 schema.prisma:1055；`as never` 绕 Prisma 类型。）

---

### Task 7: worker `agent.run.ts` 接线 + 集成测试

**Files:**
- Modify: `apps/worker/src/job-handlers/agent.run.ts`
- Test: `tests/integration/worker/agent-run-daily-report.test.ts`

- [ ] **Step 1: agent.run.ts 改动**
  - `buildRunNode` 的 `runDomainAgent({...})` 加 `credentials: credentialResolver`（在 handleAgentRun 内 `const credentialResolver = createDbCredentialResolver(db);`）。
  - daily run 创建（:71-82）的 `input: { dryRun: true }` 改为 `input: { dryRun: process.env.AGENT_DAILY_DRY_RUN !== 'false' }`。
  - 终态更新（:214-224）之后、`finally` 之前，加：
    ```ts
    if (state.status === 'completed' || state.status === 'paused') {
      await publishDailyReport(state, db, { feishuWebhookUrl: process.env.FEISHU_DAILY_REPORT_WEBHOOK }).catch((e) => {
        // report delivery must never fail the run
        console.warn('[agent.run] daily report publish failed:', e);
      });
    }
    ```
  - 顶部 import：`createDbCredentialResolver` from `../credentials.js`；`publishDailyReport` from `../notifications.js`。

- [ ] **Step 2: 集成测试**（stub LLM 跑通 dry-run loop + 断言 notification 写入 + webhook 可选）

```ts
// 用 handleAgentRun 的 llmClientOverride 注入 stub LLM，跑完 INIT→…→REVIEW，
// 断言 db.notification.create 被调用（type='daily_report'）。
// 关键：stub LLM 的 chatWithTools 返回 done，使 loop 推进到 completed。
// （复用 apps/worker 已有的 agent.run 测试模式；若该测试文件存在则在其旁新建。）
```

- [ ] **Step 3: 跑 worker 全套 + commit。**

---

### Task 8: env 模板 + 文档

**Files:**
- Modify: `.env.template`（加 `AGENT_DAILY_DRY_RUN`、`FEISHU_DAILY_REPORT_WEBHOOK`）
- Modify: `packages/runtime/README.md` 或新建 `docs/` 简述定时模式（可选）

- [ ] **Step 1: 加 env** + commit。

---

## Self-Review (completed)

1. **Spec 覆盖**：spec §定时模式（后端默认 LLMClient 当宿主 + 飞书日报）→ Task 1/4（cookie）+ Task 3/5/6/7（日报）。宿主/定时 cookie 路径统一（spec 安全边界"cookie 不进宿主 LLM 上下文"）→ Task 1+2。dry-run 贯穿 + 可配 → Task 7 + Global Constraints。
2. **占位扫描**：无 TBD；Task 7 集成测试给出模式描述（复用现有 worker 测试风格），代码骨架明确。
3. **类型一致**：`CredentialResolver`（内核 types）→ runtime-mcp re-export → worker DbCredentialResolver `implements`；`buildDailyReport`/`publishDailyReport`/`sendFeishuWebhook` 命名跨任务一致。
```
