# Agent 架构重构设计（绿地重构）

**Status:** Draft for review
**Date:** 2026-06-18
**Author:** 架构重构 brainstorming 产出

## Goal

把当前"缝缝补补、两套并行 agent 体系、概念混层"的项目，重构成一份**结构清晰、架构简洁但完整健壮**的多 agent 架构，达到**可交付真实用户上线使用**的标准。

重构不保留现有顶层架构，但**复用现有领域资产**（browser-runner、7 个领域 skill、7 个发布能力、DB schema）作为积木。现有东西当积木，顶层重写。

## 背景：当前架构为什么必须重构

调研发现当前存在两套并行且互不相通的 agent 体系：

- **体系 A（托管 chat 工作台）**：`apps/web` 的 Next.js `/api/chat` + Vercel AI SDK + 47 个业务 tool（REST 薄包装）+ worker BullMQ 线性 step 执行器。自带 LLM、大而全。
- **体系 B（portable MCP agent）**：`packages/growth-ops-agent` MCP server + 9 个原生 tool + 1 个运营 loop。依赖外部 host 提供 LLM。

两套互不调用（MCP agent 不调领域 skill；workflow engine 调 skill 不调 MCP agent）。此外还存在：

- 概念混层：`agent` / `skill` / `tool` / `workflow` / `thread` / `execution` 职责相互竞争而非组合。
- 上下文无管理：每轮把整个对话数组全量塞 prompt，无截断，长对话必溢出。
- 记忆名不副实：只有 KV 偏好 + 实时上下文注入，没有真正的多层记忆。
- DB 参数脱节：`temperature`/`maxTokens`/`dailyTokenLimit` 存了不读、不强制。
- 死代码：`skills/manifests/*.json` 无 loader 加载；`capability-schema` 悬空；`apps/runtime-core`（含 5 个假 graph）已于 2026-06-17 删除。

结论：不是局部修补能解决的，需要绿地重构。

## 核心决策（已与决策者确认）

1. **绿地重构**：顶层重写，现有资产当积木复用。
2. **形态 = supervisor + 业务域专职 agent**（LangGraph/CrewAI 类）。多 agent = 多个有边界的角色，由调度器编排。
3. **主运行宿主 = 后端自管 runtime**：supervisor + 多 agent 在后端跑，自管 LLM + DB 多层记忆。**portable 降为 MCP 适配层**（把内核能力投影成工具集上架），不是复刻整个多 agent 编排。
4. **调度器 = 固定运营 loop 状态机 + LLM 智能转移**：固定转移图保证可预测/可复盘，转移决策用 LLM 做智能判断（跳过/暂停/优先级）。主动触发（proactive）作为第二刀特性。
5. **自主等级 = 默认 L2（Autopilot-light）**：低风险高置信写操作自动执行，高风险 escalate 人工。L3 全自动是终态目标，靠 L2 积累置信度后逐步放权。
6. **记忆 = 务实三层**：L0 工作记忆 / L1 用户长期偏好 / L2 事实历史。
7. **质量底线 = 交付标准**：架构完整健壮（不欠技术债），速度靠收窄 MVP 范围（第一刀只做内容→发布闭环）。

## 核心原则：心智模型转变

这是产品形态的根本转变，影响所有后续设计：

| | 旧（缝补态） | 新（重构态） |
|---|---|---|
| 默认交互 | 人指挥智能体一步步做，每步等人 | **智能体每天自主跑完整 loop**（autonomous daily run） |
| 人的角色 | 操作者 | **监督者**：设边界 + 处理 escalate 的高风险项 + 看复盘 |
| gate | 硬拦所有写操作 | AI 自主风控 + 可调自主等级 |

**第一性原则**：给真实用户用的 AI 智能体产品，必须"先建立信任，才能放权"。社媒账号副作用公开且不可逆（发错内容/回错评论可能毁账号、封号），所以"代替人工"是渐进的——信任在前，自动化在后。

## 总体架构：6 层 = 4 层 runtime-agnostic 内核 + 2 个适配层

核心思想：**中间 4 层是纯逻辑、不绑定 LLM 来源也不绑定入口的内核**；上面 Interface 层决定"怎么进来"，下面 Asset 层决定"复用什么"。换 Interface 层即可把内核 tool/skill/记忆查询投影成 portable，内核零改动。

```
┌──────────────────────────────────────────────────────────┐
│  ① Interface 层（入口投影，可替换）                         │
│     · Workbench API（HTTP，主入口，自管 LLM）               │
│     · MCP Adapter（portable，把同一内核投影成工具集上架）     │
└───────────────────────────┬──────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│  ② Orchestrator 层                                        │
│     Supervisor = 固定运营 loop 状态机 + LLM 智能转移         │
│     职责：推进主线、节点间传递上下文、路由用户插话、主动触发   │
└───────────────────────────┬──────────────────────────────┘
                            │ 派发到节点
┌───────────────────────────▼──────────────────────────────┐
│  ③ Agent 层（业务域专职，节点内自主 multi-step）             │
│     supervisor · content-agent · publish-agent             │
│     interaction-agent · lead-agent                         │
└─────────┬───────────────────────────────────┬────────────┘
          │ 读/写 tool                        │ 读/写 memory
┌─────────▼──────────────────┐  ┌─────────────▼──────────────┐
│  ④ Tool 层                  │  │  ⑤ Memory 层（三层）         │
│  统一 Tool Registry          │  │  · L0 工作记忆（运行时）     │
│  · 按域划 agent 可见 tool    │  │  · L1 用户长期偏好/规则      │
│  · 共享只读 tool             │  │  · L2 事实/历史（可检索）    │
│  · 写操作统一自主等级 gate    │  │  统一读写接口，按 agent 注入  │
└─────────┬──────────────────┘  └─────────────┬──────────────┘
          │                                    │
┌─────────▼────────────────────────────────────▼──────────────┐
│  ⑥ Asset 层（复用现有积木，不重写）                            │
│     browser-runner · 7 领域 skill · 7 发布能力 · DB(Prisma)   │
└──────────────────────────────────────────────────────────┘
```

**为什么是这个形状**：
- **清晰**：6 层单向依赖，上层只调下层，无环。每层职责一句话讲清。
- **简洁**：内核只有 4 层，没有 supervisor-graph / capability-registry / runtime-adapter 那些被证明空转的中间层。
- **健壮**：写操作 gate 收敛在 Tool 屄一处；记忆有统一接口；Orchestrator 是确定性骨架 + 局部 LLM，可复盘可重放。
- **portable 是投影不是复刻**：换 Interface 层（MCP adapter）即可上架，内核零改动。

### 数据流（一个请求怎么走）

```
请求 → Interface 层 → Supervisor 识别当前 loop 节点
     → 派给对应 Agent（带该节点 L0 工作记忆 + 从 Memory 层注入的 L1 偏好/相关 L2 历史）
     → Agent 自主 multi-step：调自己域的 Tool（经 Asset 层执行）+ 读 Memory
     → 写操作过自主等级 gate（agent 自评 risk/confidence + gate 兜底）
     → 结果回写 Memory（L2 事实历史）+ 返回 Supervisor
     → Supervisor 智能转移：判断下一步（推进/跳过/暂停问人/优先级）
```

## Tool 层设计

核心：**一个注册源、一套契约、显式可见域、一处 gate、自动双投影**。直接干掉现有两套散 tool（47 + 9 + skill 胶水）。

### 统一注册源 + 统一强契约

所有 tool 在唯一的 `ToolRegistry` 注册。每个 tool 一份强契约（强制 input **和** output schema——现有 47 tool 缺 output schema，是补齐项）：

```ts
interface ToolDefinition<I, O> {
  name: string              // 全局唯一，domain.action 风格：content.list_videos
  domain: Content|Publish|Interaction|Lead|Auth|Shared|Meta
  mutate: Read | Write      // 决定是否过 gate
  inputSchema:  JSONSchema
  outputSchema: JSONSchema  // 现状缺失，统一补齐
  capability?: string       // 引用 capability-schema（之前悬空，现在落地）
  executor: (input, ctx) => Promise<O>   // runtime-agnostic 纯函数，调 Asset 层
}
```

`executor` 是纯函数，调 Asset 层（browser-runner / DB / skill runner），**不绑定 HTTP 也不绑定 stdio**——这是内核 runtime-agnostic 的关键。

### 显式可见域（agent 只看到自己的 tool）

| Agent | 专属域 | 共享只读 |
|---|---|---|
| `content-agent` | `content.*`（draft/rewrite/compliance 经 skill） | `shared.*` |
| `publish-agent` | `publish.*` + `auth.*` | `shared.*` |
| `interaction-agent`（第二刀） | `interaction.*`（fetch/classify/suggest/reply 经 skill） | `shared.*` |
| `lead-agent`（第二刀） | `lead.*`（search/score/convert/sink） | `shared.*` |
| `supervisor` | `meta.*`（推进 loop / 查状态） | `shared.*` |

`shared` 是所有 agent 共享的只读工具：`get_today_metrics` / `get_account_status` / `query_memory` / `get_today_tasks`。**supervisor 不直接碰业务 tool**，只编排——这是防止 supervisor 和 agent 抢着干活的关键边界。

### 写操作统一自主等级 gate（收敛在一处）

所有 `mutate=Write` 的 tool（`publish.video` / `interaction.reply_*` / `lead.convert` / `auth.login`）执行前过**同一个** `ConfirmationGate`。gate 基于全局自主等级 + 每次写操作的 `risk` + `confidence` 评估：

```
executor 调用前 → ConfirmationGate.check(tool, input, ctx)
  读全局自主等级 + tool 的 risk + agent 给的 confidence
  ├─ L1 保守：所有写操作 escalate 人工确认
  ├─ L2 推荐（默认）：低风险高置信自动放行；高风险 escalate
  ├─ L3 激进：全自动放行，仅记录可追溯
  └─ dry-run：始终拦截，返回模拟结果
```

这替换掉现有散落三处的 gate：growth-ops-agent 里硬编码在 3 个 tool 的 `requireConfirmation`、chat route 的 prompt gate、各 job handler 里的零散检查。**写操作的拦截，全局只有这一个入口**。双层兜底：agent 自评 risk/confidence + gate 硬拦截，任一拦就拦。

### 自动双投影（workbench + MCP 同源）

registry 注册一次，两个 adapter 自动暴露同一份 tool：
- **Workbench adapter**：tool → 内部 service（现有 REST 路由逐步退化为这层薄壳）。
- **MCP adapter**：tool → MCP tool definition；宿主调用 → 转发到内核 `executor`。

→ 新增一个 tool，registry 注册一次，workbench 和 portable **两边自动都有**，零重复。

## Memory 层设计

务实三层，每层职责单一、生命周期不同、注入方式不同。**这一层同时解决了上下文管理问题**：分层注入 + 召回式历史，干掉现有"每轮全量塞历史塞爆 context"的隐患。

### 三层数据模型

| 层 | 内容 | 生命周期 | 存储 | MVP |
|---|---|---|---|---|
| **L0 工作** | 当前 loop 节点、正在处理的对象、本节点中间结果 | 单次运行/会话，结束即提炼 | 进程内 + Redis（跨进程） | ✅ 第一刀 |
| **L1 偏好** | 品牌 voice、内容偏好、回复风格、避免话题、运营硬规则、账号配置 | 长期持久，跨会话 | DB（升级现有 `AppConfig`） | ✅ 第一刀 |
| **L2 历史** | 线索互动史、内容效果、已发布内容、分级结果、会话摘要 | 长期持久，可检索 | DB 现有业务表 + 检索索引 | ⏳ 第二刀（写入第一刀就有，检索后置）|

统一读写接口，agent **不直接碰 DB**，只走两条路：由 supervisor 自动注入，或调 `shared.*` 域的 memory tool（`query_memory` / `set_preference`）。

### 分层注入策略（= 上下文管理方案）

```
agent 每轮 prompt =
   system(角色 + L1 偏好中本域相关项)      ← 每次注入，量小高频，按 agent 域裁剪
 + 当前任务(L0 工作记忆，supervisor 注入)   ← 本节点上下文
 + L2 召回的相关历史(按需)                  ← agent 主动 query_memory，不全量
```

- **L1 全量但裁剪**：content-agent 只拿 brand voice+内容偏好+避免话题，不拿回复风格。量小，安全注入。
- **L2 召回式不全塞**：interaction-agent 处理某条评论时，**主动** `query_memory` 拉该用户过往互动；不处理就不拉。把现有 `buildOperationalContext` 一次拉 4 个源的"推"模式，改成 agent 按需的"拉"模式——**context 用多少取多少**。
- **L0 短期累积**：节点内 multi-step 的中间状态留在 L0，节点结束提炼关键产物到 L2。

### 和现有资产的关系

- 现有 `AppConfig`(KV 偏好) → 升级为 **L1**，补结构化字段（已有 `brandVoice`/`avoidTopics` 雏形）。
- 现有 `buildOperationalContext` 拉的"实时运营上下文" → 拆进 **L2 查询** + `shared.get_today_tasks`，不再每次全推。
- 现有"对话历史全量传、无截断" → **直接消除**：L0 存当前节点、L2 按需召回。
- 写入：业务 tool 执行后自动落 L2（`interaction.reply` 后写 Interaction 记录、`publish.video` 后写 PublishRun）——**第一刀就有写入**，只是不开放检索。

## Orchestrator 层设计

**固定运营 loop 状态机（确定性骨架）+ LLM 智能转移（局部智能）**。supervisor 主体是状态机，转移决策用 LLM，只在"智能转移 + 复盘 + 用户插话意图识别"调 LLM——日常推进尽可能确定性，省钱可预测。

### loop 节点定义（固定主线）

| 节点 | 派给 | 主要 tool | gate | 可跳过 |
|---|---|---|---|---|
| `INIT` 认证 | publish-agent | `auth.login/status` | login=Write | — |
| `METRICS` 今日数据 | content-agent | `content.list_videos` | R | — |
| `PROSPECT` 公域线索 | lead-agent | `lead.search` / `interaction.fetch_comments` | R | 无线索则跳下游 |
| `TRIAGE` 分级 | interaction-agent | `interaction.classify` / `lead.score` | R | — |
| `REPLY` 回复 | interaction-agent | `interaction.suggest_reply` / `reply_*` | **W** | 无可回复则跳 |
| `CONTENT` 内容 | content-agent | `content.draft` / `rewrite` / `compliance` | R | — |
| `PUBLISH` 发布 | publish-agent | `publish.video` | **W** | — |
| `REVIEW` 复盘 | supervisor | `meta.summarize`（拼各域小结） | R | — |

转移逻辑：节点 agent 返回 `done` → 推进；`need_input`/`blocked` → 暂停等 operator；`empty`（如 PROSPECT 无线索）→ 按表跳过下游。转移的**合法性由固定图保证**（不能乱跳），但**该不该跳过/优先级/要不要暂停**由 LLM 智能判断。

### supervisor 的 LLM 点（其余纯代码）

1. **智能转移决策**：基于当前状态、L2 历史、用户意图，判断下一步。
2. **用户临时插话意图识别**：判断"该路由给哪个 agent / 是否打断当前 loop / 还是排队"。
3. **REVIEW 复盘**：拼各 agent 小结成日报。

**主动触发（proactive，第二刀）**：supervisor 监控数据流，发现"这个线索现在就该跟""这条内容该发了"时主动起任务，不等人发起。

### 节点内 agent 自主边界

agent 在自己节点内完全自主 multi-step（多次调 tool + 推理），但有硬边界：
- 不能跨节点（不能自己从 CONTENT 跳到 PUBLISH）。
- 只能用自己域 + shared 的 tool（可见域限制）。
- 写操作过统一 gate。
- 完成后返回**结构化结果**给 supervisor（不是自由文本）。
- **自我风控**：agent 自评 risk，高风险主动暂停求确认（agentic self-regulation），不依赖 supervisor 强制。

### 和现有 worker / BullMQ 的关系（迁移边界）

| 现有 | 新架构里的归宿 |
|---|---|
| `workflow.execute`（线性 step + `${var}` 模板替换） | **被 supervisor 状态机取代**（更结构化，有显式跳过/暂停/插话） |
| BullMQ 队列 + 延迟 job + 重试 | **保留**——长任务（调 LLM + browser-runner）仍异步化，定时发布仍用 delayed job |
| `WorkflowExecution`/`StepResult` 表 | **演进为 Run/Session 表**，存 supervisor 状态 + L0 工作记忆 |
| 各业务 job handler（publish/interaction） | **下沉为 tool executor**（注册进 registry），不再以 job 形式存在 |

一句话：**用状态机做编排，用 BullMQ 做异步执行**——各司其职，不重叠。worker 进程保留，从"跑 workflow"变成"跑 agent loop + tool executor"。

### 用户插话路由（review-driven loop 交互）

operator 随时可插话（"先发抖音那条""这个用户重点跟"）。supervisor 处理：
- 意图识别（LLM 点 2）→ 路由到对应 agent。
- 若打断当前节点 → 暂存当前 loop 状态，处理完插话后**恢复**到断点（L0 工作记忆保证不丢上下文）。
- 这是 SKILL.md "review-driven" 在新架构的落地：主线自动推进，但随时可被 operator 引导。

## Agent 层设计

| Agent | 职责 | 可见 tool 域 | 复用 skill | I/O |
|---|---|---|---|---|
| `supervisor` | 编排：推进 loop / 路由插话 / 复盘 / 主动触发 | `meta.*` + `shared.*` | — | 输入(用户请求/定时触发) → 输出(loop 状态推进) |
| `content-agent` | 选题/创作/合规/改写 | `content.*` + `shared.*` | content-writing, platform-rewrite, compliance-check | 输入(选题/今日数据/偏好) → 输出(内容草稿/合规结论) |
| `publish-agent` | 账号/认证/排期/发布/状态 | `publish.*` + `auth.*` + `shared.*` | 7 个发布能力 | 输入(内容+媒体+目标平台) → 输出(发布结果/状态) |
| `interaction-agent`（第二刀） | 评论/私信抓取→分类→建议→回复 | `interaction.*` + `shared.*` | lead-classification, reply-suggestion | 输入(互动数据) → 输出(分类+建议+回复) |
| `lead-agent`（第二刀） | 线索挖掘/分级/转化/沉淀 | `lead.*` + `shared.*` | research-insight | 输入(候选) → 输出(分级+跟进动作) |

## MVP 第一刀切片（内容→发布闭环）

| | In scope（第一刀） | Out of scope（第二刀及以后） |
|---|---|---|
| Agent | `content-agent` + `publish-agent` + `supervisor`(含 auth) | `interaction-agent` / `lead-agent` |
| Tool 域 | `content.*` + `publish.*` + `auth.*` + `shared.*` + `meta.*` | `interaction.*` / `lead.*` |
| Memory | L0 工作 + L1 偏好 | L2 检索（写入第一刀就有，检索后置） |
| 自主等级 | L2（低风险自动/高风险 escalate） | L3 放权 |
| 触发 | 被动（定时 + 手动） | 主动触发（proactive） |
| Loop 节点 | INIT→METRICS→CONTENT→PUBLISH→REVIEW | PROSPECT/TRIAGE/REPLY（第二刀接入） |

用户拿到第一刀就能每天跑内容→发布闭环，关键处自己拍板。

## 交付标准（生产级质量门，每项都要过）

给真实用户上线，第一刀必须过以下质量门：

- [ ] **可测试**：每层单元测试；关键路径（loop 推进 / gate 拦截 / tool 执行 / 自主等级决策）集成测试；tool executor 可独立 mock 测试。
- [ ] **健壮性**：tool 失败重试（BullMQ 现有能力）、发布幂等（保留现有 `publish.execute` 幂等逻辑）、LLM 调用失败有 fallback、agent 异常不崩整个 loop。
- [ ] **可观测**：结构化日志（每个节点/工具调用/gate 决策可 trace）、token 用量追踪（复用 `SkillRun` 表）、Run 状态实时可查。
- [ ] **安全**：gate 双层兜底（agent 自评 + gate 硬拦截）、cookie/凭证不进 LLM 上下文、敏感操作审计日志。
- [ ] **可回滚**：状态机可重放、dry-run 模式贯穿、写操作可追溯。
- [ ] **文档**：每个 agent / tool / 层有文档 + 架构总览 + 运维 runbook。

## 迁移路线（增量，不是大爆炸重写）

新内核先并行搭起来、跑通后再删旧的两套，避免中间态瘫痪：

1. **内核骨架**（新代码，不碰旧）：`ToolRegistry` + `Memory` 接口 + supervisor 状态机 + agent 框架 + `ConfirmationGate`(L2 风控)。
2. **资产迁入内核**：7 skill→tool 注册 / browser-runner 保留为 executor 依赖 / 7 发布→`publish.*` / `AppConfig`→L1 / `workflow.execute`→被 supervisor 取代（BullMQ 保留）。
3. **Interface 层**：Workbench API + MCP adapter（投影同一 registry）。
4. **删旧**：最后删 ai-tools 47 tool、growth-ops-agent 9 tool、workflow.execute——确认新内核全跑通才删。

## subagents 并发实现策略

**前提（串行，必须先做）**：定死所有接口契约——`ToolDefinition` / `Memory` 接口 / agent I/O 协议 / 状态机节点协议。契约不定死，并行必冲突。

**契约定死后，第一刀的并行单元**（每个派一个 subagent）：

- 内核：ToolRegistry + ConfirmationGate
- 内核：Memory（L0 + L1）
- 内核：supervisor 状态机
- `content-agent` + `content.*` tool 子集
- `publish-agent` + `publish.*` + `auth.*` tool 子集
- Interface：Workbench API（**MCP adapter 第一刀后置**，registry 已为双投影预留，第二刀接入即可投影上架）

约 5–6 个并行单元，能显著加速验证。

## 演进路径

```
第一刀（快速上线，用户能用）：
  被动 loop（定时/手动触发）
  + L2 自主等级（低风险自动/高风险 escalate）
  + memory L0 工作 + L1 偏好
  → 用户每天能用智能体跑内容→发布，关键处自己拍板

第二刀（体现"AI 智能体代替人工"差异化）：
  主动触发（proactive，监控线索主动起任务）
  + L2 → L3 逐步放权
  + memory L2 检索（历史召回）
  + interaction-agent / lead-agent 接入
  → 智能体不等你就主动干活，人变监督者
```

## 已知风险与权衡

| 风险 | 缓解 |
|---|---|
| L2 自动执行写操作出错损害用户账号 | 自主等级可调；新账号默认 L2 但 escalate 范围保守；dry-run 贯穿；双层 gate 兜底 |
| LLM 智能转移决策不稳定/贵 | 固定转移图约束合法路径（不能乱跳）；转移决策只在关键点调 LLM；日常推进尽可能确定性 |
| 内核+双适配层复杂度高 | MVP 只做 workbench adapter，MCP adapter 第一刀可后置（registry 已为双投影预留） |
| 迁移中间态两套并存 | 增量迁移：新内核搭好跑通再删旧；不破坏现有可用路径 |
| agent 端到端自主难测 | 状态机可重放 + dry-run + 每个 tool executor 可独立 mock |

## Out of Scope（本次重构不做）

- L3 全自动（终态目标，靠 L2 积累后逐步放权）。
- 主动触发 proactive（第二刀）。
- interaction-agent / lead-agent（第二刀）。
- L2 记忆检索（第二刀；写入第一刀就有）。
- 现有 `apps/web` chat 前端的 UI 改造（后端架构先行，前端第二刀配合"监督者"形态改）。
- 重写 browser-runner / 7 skill / DB schema（作为资产复用，不重写）。
