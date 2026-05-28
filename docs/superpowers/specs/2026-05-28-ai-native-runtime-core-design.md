# AI Native Runtime Core Design

**Date:** 2026-05-28

## Goal

将当前偏 SaaS、偏 Web/API 中心的项目，收缩并重构为一个面向单客户私有部署的 AI Native 运营执行内核。

这套内核需要满足两个目标：

1. 明确以 `LangGraph` 作为初期就接入的 workflow/orchestration 中枢。
2. 在 OpenClaw 这类 agent runtime 环境中可安装、可运行、可扩展，支持通过 skills、tools、function calling 组合完成 6 平台自动化发布，以及抖音 / 小红书评论和私信运营与潜客挖掘。

## Current Project Analysis

### Current architectural mismatch

当前项目的核心问题不是“缺某个功能”，而是整体设计目标与真实交付场景不匹配。

- 当前代码默认面向通用 SaaS：有平台账号管理、浏览器扫码登录会话、Web 页面为中心的执行入口。
- 实际目标是单客户私有部署：客户实例独立运行，不需要多租户 SaaS 模型，也不需要系统内部自研完整的扫码登录产品。
- 当前执行层以 `apps/api`、`apps/browser-runner`、`apps/web` 为主轴，skills 和 agent runtime 并不是系统一等公民。
- 当前平台自动化能力分散在 browser-runner、connectors、providers 中，能力边界和数据边界都偏重，后续扩展 skill 体系会越来越难。

### What remains valuable

现有仓库中仍有几类资产值得保留：

- 任务、内容、互动、线索等业务域模型
- 已有的部分平台交互与 browser-assist 经验
- 数据库存储与测试基础设施
- 已有的 worker / connector / provider 抽象里沉淀的部分平台约束

### What is over-designed for the target scenario

针对单客户交付和 OpenClaw 安装场景，下面这些设计已经偏重：

- SaaS 化 `PlatformAccount` 和 Web 内账号管理
- browser login session 轮询体系
- Web 扫码弹窗 + API 会话管理
- 以 route handler 为中心的执行模型
- 为完整前端控制台预埋的大量页面和交互层

## Product Definition

本项目应重新定义为：

**一个面向单客户私有部署的 AI Native 运营工作内核。**

它的运行方式是：

- 客户或实施人员将其安装进 OpenClaw 等 agent runtime 环境
- 用户主要通过 runtime 入口、CLI 或后续轻量控制台触发任务
- 系统通过 `LangGraph + Supervisor Agent + Skill Registry + Runtime Adapter` 调度 skills、tools、functions
- 最终实现发布运营、互动运营和潜客沉淀

它不是：

- 一个通用多租户 SaaS 产品
- 一个以 Web 页面为唯一主入口的内容系统
- 一个只绑定 OpenClaw 的一次性脚本集合

## Scope and Non-Goals

### Phase 1 target scope

第一阶段必须覆盖：

- 6 平台自动化发布
- 抖音 / 小红书评论抓取与回复建议
- 小红书私信抓取与回复建议
- 评论 / 私信中的潜客提取与沉淀
- skill 安装、卸载、启停、健康检查
- `LangGraph` workflow 编排
- OpenClaw runtime 接入

### Explicit non-goals for Phase 1

第一阶段明确不做：

- 完整 Web 控制台
- 复杂账号管理与多租户权限
- 系统内部自研扫码登录产品
- 复杂 CRM / 运营报表 / 审批流
- 多 runtime 全量适配
- 远程 skill 市场

## Chosen Architecture

采用 **Runtime-first AI Native Architecture**。

核心原则：

- Web 不是执行中枢，runtime core 才是中枢
- 上层按 capability 调度，而不是按 skill 名字硬编码
- `LangGraph` 负责流程编排、状态流转、checkpoint 和人工介入
- Supervisor Agent 负责意图识别与决策，不直接承担复杂执行
- skills 负责平台耦合、浏览器耦合、外部动作
- tools / function calling 负责确定性、原子化系统动作

## High-Level Architecture

### 1. Supervisor / Intent Router

总 Agent 接收输入请求，负责：

- 意图识别
- 参数抽取
- workflow 选择
- capability 需求判定
- 结果汇总

它不直接做平台动作，也不应直接写核心业务状态。

### 2. LangGraph Workflow Orchestrator

`LangGraph` 是初期就必须引入的中枢组件，负责：

- workflow 状态管理
- 节点调度
- 分支决策
- 失败恢复
- checkpoint / resume
- human-in-the-loop 暂停与恢复

它承载的是业务 orchestration，而不只是技术流程图。

### 3. Skill / Capability Registry

系统通过 registry 管理已安装 skills 及其 capability。

上层 workflow 永远通过 capability 解析可用 skill，而不是直接耦合某个实现目录或脚本路径。

### 4. Runtime Adapter Layer

Runtime adapter 屏蔽不同执行环境的差异。

第一阶段先实现 `OpenClawAdapter`，但接口保持通用，后续可以扩展：

- `LocalCliAdapter`
- `McpAdapter`
- `FunctionCallingAdapter`

### 5. Domain Workflows

业务流程统一由 graph/workflow 承载，例如：

- 多平台发布
- 评论/私信运营
- 潜客提取
- skill 生命周期管理

### 6. State Store and Artifact Store

保存：

- workflow run
- skill run log
- 互动数据
- lead 数据
- artifacts
- credential references

它是业务记忆层，不承担平台执行逻辑。

## Recommended Repository Structure

```text
apps/
  runtime-core/
    src/
      entrypoints/
      cli/
      server/
      graphs/
      workflows/
      agents/
      registry/
      runtime-adapters/
      tools/
      state/
      storage/
      domain/
      config/
packages/
  skill-sdk/
  capability-schema/
  workflow-contracts/
  shared-types/
skills/
  installed/
  manifests/
data/
  runs/
  artifacts/
  credentials/
  registry/
docs/
  superpowers/
```

### Structure rationale

- `graphs/` 只定义 LangGraph 状态图与节点连接
- `workflows/` 封装面向业务的运行入口
- `registry/` 管理 skills 与 capabilities
- `runtime-adapters/` 屏蔽 OpenClaw 等运行环境差异
- `tools/` 放系统确定性原子能力
- `skills/` 作为外部能力单元，不应和主源码强耦合
- `data/` 目录天然适配单客户部署与本地 artifact 管理

## Core LangGraph Workflows

第一阶段只落 5 条核心 graph。

### 1. Supervisor Graph

职责：

- 接收请求
- 识别意图
- 选择业务 graph
- 注入上下文

核心 state：

- `request_id`
- `intent`
- `selected_workflow`
- `required_capabilities`
- `runtime_context`
- `errors`

### 2. Multi-Platform Publish Graph

职责：

- 校验发布输入
- 解析目标平台
- 检查 capability
- 调用平台 skill
- 汇总发布结果

要求支持部分成功，不能强制全成全败。

### 3. Interaction Ops Graph

职责：

- 抓取评论 / 私信
- 归一化
- 去重
- 分类
- 生成回复建议
- 识别潜客候选

Phase 1 先覆盖：

- 抖音评论
- 小红书评论
- 小红书私信

### 4. Lead Mining Graph

职责：

- 从评论 / 私信候选中判断意向
- 提取需求与画像
- 生成 / 更新 lead
- 给出推荐下一步动作

### 5. Skill Lifecycle Graph

职责：

- 安装 skill
- 卸载 skill
- 启用 / 禁用
- 健康检查
- 重建 capability registry

## Skill and Capability Design

### Skill Manifest

每个 skill 必须提供统一 manifest，至少包含：

- `skill_id`
- `name`
- `version`
- `runtime`
- `entrypoint`
- `description`
- `capabilities`
- `input_schema`
- `output_schema`
- `dependencies`
- `healthcheck`
- `install_type`

### Capability Definitions

Phase 1 标准 capability 清单：

- `publish.video`
- `publish.article`
- `publish.note`
- `interaction.fetch_comments`
- `interaction.fetch_messages`
- `interaction.reply_comment`
- `interaction.reply_message`
- `lead.extract`
- `auth.check`
- `auth.login`
- `skill.healthcheck`

### Registry Responsibilities

Registry 至少应提供：

- `discoverInstalledSkills()`
- `loadManifest(skillId)`
- `listCapabilities()`
- `resolveSkillByCapability(capability, context)`
- `enableSkill(skillId)`
- `disableSkill(skillId)`
- `installSkill(source)`
- `uninstallSkill(skillId)`
- `checkSkillHealth(skillId)`
- `rebuildRegistry()`

### Install / Uninstall policy

第一阶段只支持：

- local path install
- git repo install
- bundled skill install

安装 / 卸载权限默认给实施或运维人员，不直接开放给客户自由操作。

客户侧仅暴露 enable / disable 更合适。

## Supervisor, Tools, Skills, and Function Calling

### Responsibility split

明确采用下面的职责划分：

- Agent 决定做什么
- Workflow 决定按什么顺序做
- Skill 决定如何完成复杂外部动作
- Tool / Function 决定如何完成确定性系统动作

### Tools / function calling

适合作为 tool 的动作：

- 查询 registry
- 读取配置
- 写运行日志
- 保存 workflow 状态
- 存互动记录
- 存 lead
- 查 skill 健康状态

不适合作为 tool 的动作：

- 整个平台发布流程
- 整个平台登录流程
- 多步评论运营流程

### Human-in-the-loop points

以下场景允许 graph 暂停并等待人工介入：

- skill 健康检查失败
- 登录失效
- 回复建议需要审核
- 潜客识别置信度低
- 多平台发布部分失败
- 新 skill 安装风险待确认

## Delivery-Oriented Phase 1 Plan

### Must work by delivery time

考虑到 2026-05-29 上午需要交付到客户 OpenClaw 环境，第一阶段交付版必须满足：

1. Runtime core 可安装、可启动
2. LangGraph 可运行 5 条主 graph
3. Skill registry 可发现已安装 skills
4. OpenClaw adapter 可调起 skills
5. 6 平台发布主链路可跑通
6. 抖音 / 小红书互动抓取与回复建议可跑通
7. 潜客提取与保存可跑通

### Acceptance criteria

现场验收至少验证：

1. 能列出当前可用 skills
2. 能触发一次发布任务并得到结果
3. 能触发评论 / 私信抓取任务
4. 能生成回复建议
5. 能生成至少一条潜客记录
6. 能查看运行日志或 artifact
7. 能启停至少一个 skill

`docs/delivery/2026-05-29-openclaw-runtime-core-checklist.md` 是本次 2026-05-29 客户安装交付的现场操作清单，交付时应以该文件为准执行验证。

## Migration Direction From Current Repository

第一阶段不是一次性删除所有旧代码，而是明确迁移方向：

- 保留域模型、数据库基础、测试基础设施
- 新增 `apps/runtime-core`
- 逐步弱化 `apps/web`、`apps/api`、`apps/browser-runner` 的核心地位
- 将平台动作迁移到 skill + runtime adapter + graph
- 将 route handler 中的复杂执行逻辑迁出到 workflow / tools / registry

对于旧模块的处置原则：

- `保留`：内容、互动、线索、任务、持久化层
- `弱化`：API 触发层、browser-runner 直连模式
- `删除目标`：SaaS 化平台账号管理和登录 session 中心

## Risks and Trade-offs

### Main advantages

- 更贴合单客户私有部署
- 真正以 AI Native 为中心
- 不绑定单一 runtime
- skill 扩展边界清晰
- 更适合明天交付和后续演进

### Main risks

- 初期接口定义必须严格，否则 graph 与 skill 会快速变脆
- 需要控制 agent 数量，避免过早多 agent 化
- LangGraph 接入初期会带来少量结构调整成本
- 早期无完整 Web，体验偏工程化，需要实施支持

### Chosen trade-off

本方案有意优先：

- 可运行的 runtime core
- 清晰的 orchestration 与 capability 边界
- 可扩展的 skill lifecycle

而不是优先：

- 完整前端体验
- 大而全的 SaaS 功能面

## Final Recommendation

推荐将本项目的下一步实施方向确定为：

**以 `LangGraph` 为中枢、以 capability 调度为核心、以 OpenClaw adapter 为第一运行时适配器的 AI Native Runtime Core。**

在此基础上，优先完成：

- runtime core
- supervisor graph
- publish graph
- interaction ops graph
- lead mining graph
- skill lifecycle graph
- skill registry

后续如需补 Web，只做薄控制台，不再反向把系统拉回 Web/API 中心架构。
