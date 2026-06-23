# Portable Supervisor Runtime 设计（host-native 编排内核）

**Status:** Draft for review
**Date:** 2026-06-23
**Author:** 前端重构 brainstorming 演进产出
**关系:** 演进 [`2026-06-18-agent-architecture-refactor-design.md`](./2026-06-18-agent-architecture-refactor-design.md) 的**决策 3（运行宿主）**与**前端定位**。其余决策（绿地复用资产、supervisor + 业务域 agent 形态、固定 loop 状态机 + LLM 转移、gate 双层、memory 三层、tool 统一契约、MVP = 内容→发布闭环）全部继承不变。

## Goal

把 supervisor + 多 agent 编排做成 **host-native 的可迁移内核**：编排逻辑（脑子）可装进任意 host runtime（Claude Code / OpenClaw / 任意 MCP host），**LLM 推理由宿主出**，重工具（browser-runner / DB / cookie / 发布执行）留后端、由宿主通过 MCP 远程调。**前端不做**，输出只要结构化合理即可。

一句话产品形态：**我们出脑子（编排）+ 手（工具），宿主出 LLM；换宿主不换脑子。**

## 背景：为什么从「后端自管 runtime」演进到「host-native」

2026-06-18 spec 决策 3 定的是「主运行宿主 = 后端自管 runtime，portable 降为 MCP 适配层（投影工具集，不复刻编排）」。后续讨论中决策者明确要求**更强一档**：整个 supervisor + 多 agent 编排都要能迁移到任意 host runtime 跑，而不只是后端自管 + 工具投影。

核对现状后发现这档演进**成本远小于预期**——内核已经是高度 runtime-agnostic 的：

- `LLMClient` 已是可注入接口（[`packages/runtime/src/index.ts`](../../../packages/runtime/src/index.ts) 重导出自 `@ai-growth-ops/ai`），不绑死 provider。
- `AgentDefinition.allowedTools` 已是精确 allow-list，域隔离已落地（[`types.ts`](../../../packages/runtime/src/types.ts)）。
- `ConfirmationGate` / `WorkingMemory` / `PreferencesStore` 都是接口，存储与策略可注入。
- `createSupervisor(deps).runNode` 的语义天然就是 driver 模式——「跑当前节点 → `advance` 到下一节点」（[`supervisor.ts`](../../../packages/runtime/src/supervisor/supervisor.ts)），节点执行通过 `RunNodeDeps.runNode` 注入。

所以 host-native 不是重写，而是**把节点执行入口从「后端自调 `runDomainAgent`」翻成「把节点指令包通过 MCP 交给宿主执行」**，driver 与内核逻辑零改动。

## 与 2026-06-18 spec 的差异（仅这三处变了）

| 维度 | 2026-06-18（旧） | 2026-06-23（本次） |
|---|---|---|
| 运行宿主 | 后端自管 runtime 为体 | **整体编排可迁移、host-native、宿主出 LLM** |
| portable 定义 | MCP 投影工具集（不复刻编排） | **编排 driver + tool + host skill 整体可迁移** |
| 前端 | 第二刀配合「监督者」形态改 | **不做 apps/web；输出结构化合理即可** |

新增一项 2026-06-18 未显式处理的：**定时自主跑（无人值守）**——通过 `LLMProvider` 接口的双模式解决（见下）。

继承不变的：绿地复用资产、supervisor + 业务域 agent 形态、固定 loop 状态机 + LLM 转移、gate 双层兜底、memory 务实三层、tool 统一强契约、第一刀 = 内容→发布闭环。

## 核心心智模型

| | 旧（后端自管） | 新（host-native） |
|---|---|---|
| LLM 推理 | 后端自己调 | **宿主出**（Claude / OpenClaw / 后端默认 provider） |
| 编排控制权 | 后端 | **仍在后端 driver**（状态机/转移/域隔离/gate 硬执行） |
| 宿主角色 | 无 | 出 LLM + 在节点边界内自主调 tool |
| 换 runtime | 换不了 | **换 host skill 即可，内核零改动** |

关键：**控制权不外移**。状态机推进、节点边界、工具域隔离、写操作 gate 全在后端硬执行，宿主只在节点边界内自主。这保证 host-native 不损失可预测性与安全边界。

## 架构形态：C 混合 driver

```
┌─────────────────────── 任意 Host Runtime（Claude Code / OpenClaw / …）──────────────────────┐
│  ① 编排 skill / manifest ← 可迁移的「脑子指令」                                              │
│     循环：supervisor.next → 节点内自主调 tool → supervisor.report → 直到 completed           │
│  ② 宿主 LLM（出推理，不在我们手里）                                                           │
└───────────────────────────────────┬───────────────────────────────────────────────────────┘
                                    │ MCP（宿主只看见一组 tool）
┌───────────────────────────────────▼───────────────────────────────────────────────────────┐
│  常驻 MCP Server 后端（部署物：承载控制权 + 所有重工具）                                        │
│  ③ 编排 driver ＝ packages/runtime 现有 supervisor（状态机 + 转移 + L0 + run 状态）            │
│     暴露：supervisor.start / next / report                                                    │
│  ④ Tool executor：content.* / publish.* / auth.* / shared.* 全在此执行                         │
│     写 tool 过 ConfirmationGate（硬拦截，留在后端，不靠宿主自觉）                                │
│  ⑤ Asset：browser-runner / DB(Prisma) / cookie                                                │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

**为什么是这个形状**：可迁移的是上半部分（① 编排指令 + tool 定义），装进任意 MCP host 即可；下半部分（②③④⑤）是部署物，宿主通过 MCP 远程调。driver 控制权在后端，宿主只出推理——既保住固定 loop 的可预测可复盘，又吃满宿主 LLM 的自主 multi-step。

被否的另两种形态（备查）：A. Driver 全程硬控——宿主每步问 driver，忠实度最高但宿主被切碎成单步、啰嗦慢烧 token；B. Spec 编译软约束——状态机编译成宿主可读 spec 让宿主自跑，最顺滑但不保证忠实、会跳步。C 取两者之长。

## driver MCP 协议（核心契约）

三个 tool，对应 supervisor 的一次 run 生命周期。状态由 driver 按 `runId` 在后端维持（`SupervisorState`），宿主不持有全局状态。

```
supervisor.start({ userId, orgId, intent?, autonomyLevel?, dryRun? })
  → NodeDirective {
      runId, node: 'INIT',
      agent: 'publish-agent',          // 来自 AGENT_FOR_NODE
      instructions: string,            // agent.systemPromptBuilder(ctx) 产物
      allowedTools: string[],          // agent.allowedTools（域隔离）
      context: {                       // driver 注入
        l0: Record<string,unknown>,    // WorkingMemory.all(runId) 当前节点片段
        l1: Partial<UserPreferences>   // PreferencesStore.forDomain 偏好
      },
      gateLevel: AutonomyLevel,        // 透传，供宿主 agent 自评时参考
      dryRun: boolean
    }

# 宿主在节点内：按 instructions 用 allowedTools 自主 multi-step
#   （宿主 LLM 推理 + MCP 调后端 tool；写 tool 在后端过 gate 硬拦截）

supervisor.report({ runId, result: NodeResult })
  → driver.runNode 收尾 + advance(state, result)：
    - result.outcome ∈ {done, empty}   → 推进到 LEGAL_TRANSITIONS[next]
    - result.outcome ∈ {need_input, blocked} → 暂停，停在当前节点
  → 返回下一个 NodeDirective，或
    { status: 'completed', review: <REVIEW 日报> }  // next === null（REVIEW 完成）
```

**域隔离与 gate 落点（host-native 不损失安全边界的关键）**：

- 宿主只能调当前 `NodeDirective.allowedTools` 内的 tool；后端 tool executor 校验调用方 runId 的当前节点 + agent，**越域调用直接拒**。
- 写 tool（`mutate='Write'`：`publish.video` / `auth.login` / 后续 `interaction.reply_*` / `lead.convert`）在后端 executor 层过 `ConfirmationGate.check`，**硬拦截**，不依赖宿主自觉。
- 双层兜底（继承 2026-06-18）：宿主 agent 在调写 tool 前自评 `risk` + `confidence`（软约束，写进 instructions）；后端 gate 拿 `GateInput` 再硬判（`allowed` / `escalated`）。任一拦就拦。

**与现有内核的精确映射**：`createSupervisor(deps).runNode` 不变；唯一变化是 `RunNodeDeps.runNode` 多一个「宿主执行」实现——把 `NodeDirective` 经 MCP 返回宿主、收 `NodeResult` 回传。原有「后端自调 `runDomainAgent`」实现保留，作为定时模式的默认宿主执行路径。

## LLMProvider 接口与定时自主跑

host-native 要求「LLM 宿主出」，但 design doc 第一刀有核心特性「每天定时自主跑完整 loop」——定时触发时没有外部宿主开着。解法：**把 LLM 来源抽象成可注入接口，而非「内核绝对零 LLM 代码」**。

- 已存在雏形：`LLMClient`（`@ai-growth-ops/ai`，已注入 `RunDomainAgentParams`）。
- 本次明确双模式：
  - **宿主模式**：外部宿主（Claude Code / OpenClaw）来时，节点内 multi-step 由宿主 LLM 跑，driver 只控边界。内核不调 LLM。
  - **定时模式（无人值守）**：后端用自带 `LLMClient` 默认实现，自己当宿主跑 `runDomainAgent` 完整 loop（`apps/worker` 定时触发）。host-native 仍成立——接口可被宿主实现，定时只是「后端自己提供一个默认宿主」。
- 这同时是「内核 runtime-agnostic」的严谨表述：内核依赖 `LLMClient` 接口，不硬绑 provider；谁来当 LLM 都行。

## host-native 下的各层落点

| 层 | 落点 | 说明 |
|---|---|---|
| **gate** | 后端 tool executor 硬执行 | 写 tool 拦截在后端，宿主调 → MCP → 过 `ConfirmationGate`；不靠宿主自觉 |
| **L0 工作记忆** | driver 按 `runId` 持有（进程内 + Redis 跨调用） | 宿主只拿 driver 注入的当节点片段，不持全局状态 |
| **L1 偏好** | DB（升级现有 `AppConfig`） | driver 在 `next` 时注入节点指令包 |
| **L2 历史** | DB 业务表 | 写入第一刀就有（tool 执行后落），检索后置（第二刀）；宿主按需 `shared.query_memory` 拉，不全量——顺便干掉「每轮全量塞历史」隐患 |
| **tool** | 全后端 MCP 暴露 | 宿主侧零业务代码；纯逻辑轻 tool 第一刀也走后端，延迟优化（下沉宿主侧）后置 |

## 双 host 并行适配（第一刀）

后端 MCP server **只做一份**，「并行」的是两份 host 侧编排 skill + 双 host 验证：

- **共享**：driver 协议（`supervisor.*`）+ tool registry + Asset 层。一份后端，两个 host 都挂载。
- **Claude Code 适配**：一份编排 skill（驱动 `next → 干活 → report` 循环）+ MCP tool 配置。验证最快（当前开发环境即是）。
- **OpenClaw 适配**：host 侧驱动指令 + 同一组 MCP tool。是 [`INSTALL.md`](../../../INSTALL.md) 的交付目标。
- **差异只在 host 侧驱动指令**，后端零分叉。

## 第一刀切片（内容→发布闭环，双 host 验证）

| | In scope | Out of scope（第二刀及以后） |
|---|---|---|
| Loop 节点 | `INIT → METRICS → CONTENT → PUBLISH → REVIEW` | `PROSPECT / TRIAGE / REPLY` |
| Agent | `content-agent` + `publish-agent` + `supervisor`（含 auth） | `interaction-agent` / `lead-agent` |
| Tool 域 | `content.*` + `publish.*` + `auth.*` + `shared.*` + `meta.*` | `interaction.*` / `lead.*` |
| Memory | L0 工作 + L1 偏好 | L2 检索（写入第一刀就有） |
| 自主等级 | L2（低风险自动 / 高风险 escalate）+ dry-run 贯穿 | L3 放权 |
| 触发 | 被动（宿主手动 `start` + 后端定时） | 主动触发 proactive |
| Host | Claude Code + OpenClaw 双适配，共享后端 | 其他 MCP host（协议已通，按需接） |
| 前端 | **不做** | — |

用户拿到第一刀：在 Claude Code 或 OpenClaw 里挂载这个 agent，每天跑内容→发布闭环，关键处自己拍板；无人值守时后端定时自主跑并把日报推过来。

## 与现有代码关系 / 迁移

| 现有 | 本次归宿 |
|---|---|
| [`packages/runtime`](../../../packages/runtime/) 内核（supervisor / gate / tool-access / memory / agent / `LLMClient` 接口） | **复用，几乎零改动**。唯一变化：`RunNodeDeps.runNode` 增加「宿主执行」实现；driver 逻辑不变 |
| `runDomainAgent`（后端自调 LLM 的 agent loop） | **保留**，作为定时模式（后端默认宿主）的执行路径 |
| Tool registry（`content.*` / `publish.*` / `auth.*` / `shared.*`） | **复用**，新增一层 MCP 投影（executor 不动） |
| browser-runner / DB(Prisma) / 7 领域 skill / 7 发布能力 | **复用为 Asset 层**，不重写 |
| **新增：MCP server 包**（`packages/runtime-mcp` 或 `apps/mcp-server`） | 把 `supervisor.*` + tool registry 投影成 MCP tool；承载常驻 driver + executor + gate |
| **新增：双 host 编排 skill** | Claude Code skill + OpenClaw 适配 skill，驱动 `next/report` 循环 |
| **新增：`LLMProvider` 双模式接线** | 明确宿主模式（不调）vs 定时模式（后端默认 `LLMClient`） |
| `apps/web`（Next.js 前端） | **不做**。现有页面保留但不再投入，长期退场 |
| `apps/api`（Workbench HTTP） | **缩水保留** = 后端默认宿主（定时触发 + 默认 LLM）+ DB 访问 + 日报查询出口；对外产品入口让位给 MCP server |
| `apps/worker`（BullMQ） | **保留**，定时触发 run + 长任务异步（发布/browser-runner） |

迁移增量、不大爆炸：MCP server 先并行搭起来挂载到 Claude Code 跑通内容→发布，再接 OpenClaw，确认双 host 都跑通后才缩水 `apps/api`、退场 `apps/web`。

## 输出形态（「输出合理就行」）

- **run 结构化结果**：`supervisor.report` 的 `NodeResult` 链 + REVIEW 节点日报（JSON）。
- **落 DB**：Run/Session 表存 `SupervisorState` + L0 + 各节点 `NodeResult`——可查、可复盘、可重放（状态机确定性）。
- **定时模式**：后端跑完把日报落 DB + 推通知（复用现有 `integrations/feishu`）。
- **宿主模式**：结果直接回宿主（Claude Code / OpenClaw 里看到）。
- **无 UI**；查历史走 DB 或一个最简查询接口/CLI（挂在缩水后的 `apps/api`）。

## 交付标准（生产级质量门）

- [ ] **可测试**：driver 协议（start/next/report）单元测试；域隔离拒绝越域调用；gate 双层拦截；tool executor 可独立 mock；host 执行 adapter 与定时执行 adapter 各自可测。
- [ ] **健壮性**：MCP 调用失败重试；发布幂等（保留现有逻辑）；宿主模式 LLM 超时/异常不崩 run（driver 可暂停 `need_input`）；定时模式 LLM 失败有 fallback。
- [ ] **可观测**：每次 `next/report`、每次 tool 调用、每次 gate 决策结构化日志可 trace；token 用量追踪（复用 `SkillRun`）；run 状态实时可查。
- [ ] **安全**：写 tool gate 硬拦截在后端；cookie/凭证不进节点指令包、不进宿主 LLM 上下文；越域调用拒绝；敏感操作审计。
- [ ] **可回滚**：状态机可重放；dry-run 贯穿；写操作可追溯。
- [ ] **双 host 验证**：Claude Code + OpenClaw 各跑通一次完整内容→发布 loop（含 dry-run + 真实发布各一次）。
- [ ] **文档**：driver 协议、MCP tool 清单、双 host 挂载步骤、运维 runbook。

## 已知风险与权衡

| 风险 | 缓解 |
|---|---|
| 双 host 并行拖慢第一刀 | 后端只一份，「并行」仅 host skill + 验证；Claude Code 先跑通再接 OpenClaw |
| 宿主 LLM 自主性 vs 状态机忠实度（C 方案 inherent） | 控制权在 driver：节点边界/转移/域隔离/gate 全后端硬执行；宿主只在节点内自主，跨不了界 |
| 轻 tool 全走后端的延迟/成本 | 第一刀不优化（YAGNI）；后续可把纯逻辑轻 tool 下沉宿主侧 manifest |
| OpenClaw 执行模型未充分验证 | Claude Code 先验证架构正确性；OpenClaw 适配作为第一刀后半段，发现问题再补 host adapter |
| 定时模式后端烧 token | 定时频率可配 + dry-run 优先 + L2 自主等级保守；监控 token 用量 |

## Out of Scope（本次不做）

- `apps/web` 前端任何 UI 改造（长期退场）。
- `interaction-agent` / `lead-agent` 及 `interaction.*` / `lead.*` tool 域（第二刀）。
- L2 记忆检索（第二刀；写入第一刀就有）。
- 主动触发 proactive（第二刀）。
- L3 全自动放权（终态）。
- 轻 tool 下沉宿主侧的延迟优化。
- 重写 browser-runner / 7 skill / DB schema（资产复用）。
