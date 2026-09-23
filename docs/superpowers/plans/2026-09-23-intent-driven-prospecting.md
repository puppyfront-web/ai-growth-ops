# 自然语言需求驱动的社媒获客实施计划

**Goal:** 用自然语言需求、结构化意图和多策略计划替换面向用户的关键词获客，同时复用当前抖音采集、账号风控和任务队列。

**Architecture:** 新增纯领域 schema 和计划编译器；API 负责分析与确认计划；worker 只执行已保存的计划快照；聚合与评分围绕需求和策略证据工作。所有业务数据继续保存在本地运行环境。

**Tech Stack:** TypeScript、Zod、Prisma、Node HTTP API、BullMQ、Next.js、TanStack Query、Vitest、Playwright

---

## Task 1：定义意图与策略合同

**Files:**

- Create: `packages/shared/src/prospecting-plan.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `tests/unit/shared/prospecting-plan.test.ts`

- [ ] 先写失败测试：空需求、未知策略、超过 12 条查询和超预算计划必须失败。
- [ ] 写失败测试：合法需求可以规范化策略、查询和排除信号。
- [ ] 实现 Zod schema、领域类型和预算校验纯函数。
- [ ] 运行 `pnpm vitest run tests/unit/shared/prospecting-plan.test.ts`。
- [ ] 仅在测试通过后提交本任务。

## Task 2：实现需求分析与策略编译器

**Files:**

- Create: `packages/database/src/prospecting-plan.ts`
- Modify: `packages/database/src/index.ts`
- Test: `tests/unit/database/prospecting-plan.test.ts`

- [ ] 先写失败测试：典型 B2B 需求至少产生两种启用策略，并包含目标角色、痛点和排除对象。
- [ ] 写失败测试：模型未配置、超时、非法 JSON、未知策略和空查询返回明确错误。
- [ ] 写失败测试：账号额度不足时优先裁剪低优先级策略，总预算不越界。
- [ ] 实现 `ProspectingPlanCompiler`，注入 LLM client 和 guard 数据，避免直接依赖全局环境。
- [ ] 固定结构化 prompt，并将用户需求作为非可信数据字段传入。
- [ ] 运行目标单元测试并完成最小实现。

## Task 3：增加计划分析 API

**Files:**

- Modify: `apps/api/src/schemas/prospecting.ts`
- Modify: `apps/api/src/routes-prospecting.ts`
- Modify: `apps/web/src/lib/api/prospecting.ts`
- Test: `tests/integration/api/prospecting-plan.test.ts`

- [ ] 先写失败集成测试：`POST /api/prospecting/plan` 返回结构化计划和 `planId`，且不创建获客任务。
- [ ] 覆盖未登录、权限不足、模型未配置、非法需求和账号额度为零。
- [ ] 验证计划保存为当前用户的本地短期 draft，其他用户不能读取或消费。
- [ ] 实现薄路由并调用编译器，不在 route 中复制业务规则。
- [ ] 为 Web 增加 `analyzeProspectingRequirement` 类型安全客户端。
- [ ] 运行目标集成测试。

## Task 4：迁移任务与候选人数据模型

**Files:**

- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_intent_driven_prospecting/migration.sql`
- Test: `tests/integration/database/prospecting-plan-migration.test.ts`

- [ ] 先写失败测试：plan draft 和新任务可保存需求、意图、策略计划和版本。
- [ ] 写迁移测试：历史关键词任务生成可读取的 legacy plan。
- [ ] 新增 `ProspectingPlanDraft`，以及任务和候选人的 `requirement`、`intent`、`strategyPlan`、`planVersion`、`attributions`、`buyingStage`、`confidence` 和 `riskFlags`。
- [ ] 保留旧列用于兼容，但新写入路径不得依赖旧列。
- [ ] 从空库重放全部迁移并执行 Prisma schema diff。

## Task 5：将创建任务合同改为需求与计划

**Files:**

- Modify: `apps/api/src/schemas/prospecting.ts`
- Modify: `apps/api/src/routes-prospecting.ts`
- Modify: `apps/web/src/lib/api/prospecting.ts`
- Test: `tests/integration/api/prospecting.test.ts`

- [ ] 先写失败测试：新 API 拒绝只提交 `keywords` 的请求。
- [ ] 写失败测试：过期、已消费和非当前用户的 plan draft 被拒绝。
- [ ] 写失败测试：提交不存在的策略 ID 被拒绝，客户端不能提交查询或预算。
- [ ] 写成功测试：服务端按 `planId` 和启用策略列表复制不可变快照并创建 draft 任务。
- [ ] 写多账号测试：分析必须显式携带账号，plan draft、任务和执行器始终使用同一 `platformAccountId`。
- [ ] 删除 route 中的分词和关键词数量校验。
- [ ] 保留历史任务读取兼容，不扩大修改范围。

## Task 6：按策略计划执行采集

**Files:**

- Modify: `packages/database/src/prospecting.ts`
- Modify: `packages/shared/src/prospect-aggregate.ts`
- Test: `tests/unit/database/prospecting-execution-plan.test.ts`
- Test: `tests/unit/shared/prospect-aggregate.test.ts`

- [ ] 先写失败测试：执行器严格按已保存的 enabled 策略和预算运行。
- [ ] 写失败测试：同一用户命中两种策略后只生成一个候选人，并保留两组归因。
- [ ] 写失败测试：全部策略无结果时生成可诊断的完成状态。
- [ ] 将 keyword 循环替换为 strategy/query 循环，进度改成策略维度。
- [ ] 保持现有验证码、每日额度、视频跳过和 execution token 逻辑。
- [ ] 运行采集执行、风控和聚合相关回归测试。

## Task 7：按需求和证据评分

**Files:**

- Modify: `packages/shared/src/prospect-scoring.ts`
- Modify: `packages/database/src/prospecting.ts`
- Modify: `packages/skills/definitions/prospect-relevance-score/SKILL.md`
- Modify: `packages/skills/definitions/prospect-relevance-score/schema/input.schema.json`
- Modify: `packages/skills/definitions/prospect-relevance-score/schema/output.schema.json`
- Test: `tests/unit/shared/prospect-scoring.test.ts`

- [ ] 先写失败测试：采购咨询高于泛兴趣内容，明确同行默认被过滤。
- [ ] 写失败测试：多策略一致证据提高 evidenceQuality，但不能突破总分上限。
- [ ] 定义 audienceFit、needStrength、buyingIntent、evidenceQuality 四维输出。
- [ ] 语义评分接收 requirement、intent 和归因证据，不再依赖关键词列表。
- [ ] 模型失败时标记语义评估未完成，不把纯召回结果伪装成高质量潜客。

## Task 8：改造 Web 创建与详情流程

**Files:**

- Modify: `apps/web/src/app/(dashboard)/prospecting/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/prospecting/[id]/page.tsx`
- Modify: `apps/web/src/components/layout/Breadcrumb.tsx`
- Modify: `apps/web/src/components/layout/navigation.ts`
- Test: `tests/web/unit/prospecting-plan.test.tsx`
- Test: `tests/e2e/flow-d-lead-sync.test.ts`

- [ ] 先写失败组件测试：页面只有需求输入和“分析需求”，没有关键词输入。
- [ ] 写失败组件测试：分析后展示意图、歧义、策略卡片、预算与确认按钮。
- [ ] 写失败 E2E：输入需求、确认计划、创建任务并进入详情页。
- [ ] 实现两阶段表单，分析期间禁用重复提交并保留原始输入。
- [ ] 详情页以需求、策略进度和候选人归因替换关键词文案。
- [ ] 验证键盘操作、错误提示和窄屏布局。

## Task 9：清理旧关键词产品合同

**Files:**

- Modify: `apps/web/src/lib/api/prospecting.ts`
- Modify: `apps/api/src/services/acquisition-analytics.ts`
- Modify: `apps/api/src/services/export-service.ts`
- Modify: `packages/growth-ops-agent/src/mcp-server.ts`
- Modify: `packages/growth-ops-agent/agent/SKILL.md`
- Test: related unit and integration tests

- [ ] 用 `rg` 建立所有面向用户的关键词引用清单。
- [ ] 将分析、导出和 MCP 合同改为需求、策略及归因。
- [ ] 仅保留数据库迁移和历史任务适配层中的 legacy keyword 引用。
- [ ] 增加架构守卫，禁止新 UI/API 再引入 `keywords` 创建合同。

## Task 10：交付验证

- [ ] 运行相关单元、集成和 Web 测试。
- [ ] 运行 `pnpm lint`。
- [ ] 运行 `pnpm typecheck`。
- [ ] 运行 `pnpm test:architecture`。
- [ ] 运行 `pnpm test`。
- [ ] 运行 `pnpm build`。
- [ ] 从空库重放迁移并验证 schema diff 为零。
- [ ] 使用受控抖音账号对痛点求助、方案比较、竞品不满三类需求各执行一次。
- [ ] 检查策略差异、配额消耗、跨策略去重和候选人证据。
- [ ] 执行本地备份恢复，核对需求、计划、归因和证据一致。

只有自动化检查和真实账号手工验收均通过，才能标记为可上线交付。
