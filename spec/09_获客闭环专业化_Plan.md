# 09. 获客闭环专业化开发 Plan（P0）

> 关联：[08_获客闭环专业化_SPEC.md](./08_获客闭环专业化_SPEC.md)
> 方式：SDD（先规格）+ TDD（先失败测试，再实现）
> 原则：每完成一个切片都能独立运行、独立测试、独立回滚。

## 0. 总览

| 阶段 | 切片 | 产出 | 依赖 | 预计 |
| --- | --- | --- | --- | --- |
| P0-0 | 文档基线 | `AGENTS.md`、SPEC、Plan | 无 | 0.5 天 |
| P0-1 | 生命周期纯函数 | `packages/shared/src/lifecycle.ts` + 单元测试 | P0-0 | 0.5 天 |
| P0-2 | 数据模型与迁移 | Deal/DealActivity、nextActionAt、索引、回填 | P0-1 | 1 天 |
| P0-3 | 结局同步服务 | `packages/database/src/lifecycle.ts` + 集成测试 | P0-2 | 1.5 天 |
| P0-4 | 跟进 SLA 与逾期 | 默认 SLA、逾期 API、分配通知 | P0-3 | 1 天 |
| P0-5 | 商机 API 与管道 | CRUD、阶段流转、pipeline、overdue | P0-3 | 2 天 |
| P0-6 | 商机 UI | `/deals/pipeline`、客户详情商机区块 | P0-5 | 2 天 |
| P0-7 | 统一漏斗与内容 ROI | shared 聚合、API、`/analytics/funnel`、内容分析升级 | P0-3/5 | 2 天 |
| P0-8 | 能力矩阵 | shared 常量、API、`/integrations` 展示 | P0-0 | 1 天 |
| P0-9 | 验证与交付 | 类型/lint/测试/迁移检查/报告 | 全部 | 1 天 |

> 时间按单人估算，可并行部分见各阶段依赖。

## 1. TDD 执行顺序

严格按以下顺序，不允许先写实现再补测试：

1. 写纯函数测试 → 实现纯函数。
2. 写数据库行为测试 → 加 schema/migration → 实现领域服务。
3. 写 API 行为测试 → 实现路由/schema 校验。
4. 写 Web 交互测试 → 实现页面/组件。
5. 写 E2E → 修正集成问题。
6. 运行全量验证。

## 2. P0-1：生命周期纯函数

### 2.1 测试先行

文件：`tests/unit/shared/lifecycle.test.ts`

用例：

- `leadStatusToOutcome`：WON→won，LOST→lost，其它→null。
- `customerStatusToOutcome`：won/lost，active/inactive→null。
- `dealStageToOutcome`：won/lost，其它→null。
- `isLeadClosed` / `isCustomerClosed` / `isDealClosed`：INVALID、inactive、won/lost 的边界。
- `assertDealStageTransition`：合法流转通过；非法流转抛错；同阶段合法；won/lost 重开合法。
- `defaultNextActionAt`：A=+4h、B=+24h、C=+72h、D=null；传入固定 now 可断言。
- `overdueHours`：过去/未来/无效日期。

### 2.2 实现

文件：`packages/shared/src/lifecycle.ts`，并从 `packages/shared/src/index.ts` 导出。

类型：

```ts
export type DealStage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
```

不要从 Prisma 导入类型到 shared（shared 不依赖 database）。

### 2.3 完成标准

- 单元测试全绿。
- `pnpm typecheck` 通过。

## 3. P0-2：数据模型与迁移

### 3.1 Schema

文件：`packages/database/prisma/schema.prisma`

- 新增 `DealStage`、`Deal`、`DealActivity`。
- Customer/Lead 增加 `nextAction`、`nextActionAt`、`lastContactedAt`、`deals`。
- Organization/User 增加 `deals` 关系。
- 索引按 SPEC 第 5 节。

### 3.2 迁移

目录：`packages/database/prisma/migrations/20261019000000_acquisition_closed_loop/migration.sql`

- `CREATE TYPE "DealStage"`。
- `CREATE TABLE "deals"`、`"deal_activities"`。
- `ALTER TABLE "customers"` / `"leads"` 增加可空字段。
- 索引与外键。
- 不写数据回填（回填放脚本）。

### 3.3 回填脚本

文件：`packages/database/src/backfill-deals.ts`，导出 `backfillClosedLoop(db)`：

- 对 won/lost Customer 且无 Deal 的，创建 Deal。
- 幂等：按 `metadata.backfillSource` 去重。
- 不覆盖已有 Deal。
- 单测：`tests/unit/database/backfill-deals.test.ts`（mock db）或集成测试。

### 3.4 完成标准

- `pnpm db:generate` 成功。
- 空库 `prisma migrate deploy` 成功。
- `prisma migrate diff` 无漂移。
- 既有测试不因 schema 变更失败。

## 4. P0-3：结局同步服务

### 4.1 测试先行

文件：`tests/integration/lifecycle-sync.integration.test.ts`

用例：

1. Lead WON → Customer won；新建 Deal stage=won；重复调用不重复创建。
2. Lead LOST → Customer lost；未关闭 Deal lost。
3. Customer won → 所有未关闭 Lead/WON，Deal won。
4. Customer lost → 所有未关闭 Lead/LOST，Deal lost。
5. Deal won → Customer won，Lead WON。
6. Deal lost → Customer lost，Lead LOST。
7. Deal 从 won 重开 → Customer active，Lead QUALIFIED。
8. 已关闭的无关 Deal 不受影响。
9. 跨组织记录不被更新。

### 4.2 实现

文件：`packages/database/src/lifecycle.ts`

导出：

```ts
export async function syncLeadOutcome(db, leadId, organizationId, outcome, options?);
export async function syncCustomerOutcome(db, customerId, organizationId, outcome, options?);
export async function syncDealOutcome(db, dealId, organizationId, stage, options?);
export async function ensureDealForOutcome(db, customer, organizationId, userId, outcome);
```

要点：

- 全部在 `db.$transaction` 内。
- 查询必须带 `organizationId`。
- 幂等：已存在的结局不再重复创建 Deal/活动。
- 同步函数只处理结局，不负责阶段合法性；合法性由 shared 断言。
- 不吞错；失败回滚。

### 4.3 接线

- `PUT /api/leads/:id`：状态变化时调用 `syncLeadOutcome`。
- `PUT /api/customers/:id`：状态变化时调用 `syncCustomerOutcome`。
- `PUT /api/deals/:id`：阶段变化时调用 `syncDealOutcome`。
- Worker/自动转化：`convertInteractionToLead` 创建 Lead 时写默认 `nextActionAt`（可选，后续切片）。

### 4.4 完成标准

- 集成测试全绿。
- 手工验证：线索拖到 WON，客户详情和漏斗同步。

## 5. P0-4：跟进 SLA 与逾期

### 5.1 测试先行

- `defaultNextActionAt` 已在 P0-1 覆盖。
- `tests/integration/api/follow-ups-overdue.test.ts`：
  - Lead/Customer/Deal 各一条过期 → 全部返回，按时间升序。
  - 已成交/流失不返回。
  - 跨组织不返回。
  - 分页正确。
- `tests/integration/api/lead-assign-notification.test.ts`：
  - 分配给 B → B 收到通知。
  - 分配给自己 → 不通知。
  - 清空分配 → 不通知。

### 5.2 实现

- `apps/api/src/routes.ts` 的 Lead PUT/assign：
  - 接受 `nextActionAt`、`nextAction`。
  - 状态 CONTACTED 时写 `lastContactedAt=now`。
  - 分配通知使用 `notification-service` 新增 `onLeadAssigned`。
- `apps/api/src/routes-customers.ts`：
  - update schema 增加 `nextAction`、`nextActionAt`。
  - 新增 activity 时更新 `lastContactedAt`。
- 新路由 `apps/api/src/routes-follow-ups.ts`：
  - `GET /api/follow-ups/overdue`。
- 自动转客户时设置默认 SLA：
  - `ensureCustomerFromInteraction` 接收 `leadLevel`，创建时写 `nextActionAt`。
  - `convertProspectToCustomer` 使用 candidate.leadLevel 写默认 SLA。

### 5.3 完成标准

- 逾期队列页面/接口可用。
- 分配通知可在通知中心看到。

## 6. P0-5：商机 API 与管道

### 6.1 测试先行

文件：`tests/integration/api/deals.test.ts`

用例：

- 创建商机：成功；缺 customerId 400；跨组织 customer 404；负数金额 400；金额两位小数。
- 列表：按 stage/customer/owner 过滤；分页；不返回软删除。
- 详情：跨组织 404。
- 更新：字段更新；非法阶段流转 400；lost 无原因 400；won 写 wonAt；重开写活动。
- pipeline：open/won 金额正确；空数据返回 0。
- overdue：只返回未关闭且过期的。
- 删除：软删除后列表不返回。
- 权限：viewer 不能写。

### 6.2 实现

- `apps/api/src/schemas/deals.ts`。
- `apps/api/src/routes-deals.ts`。
- 挂载到 `apps/api/src/routes.ts` 的 `routes` 数组（或统一注册）。
- 领域逻辑放 `packages/database/src/deals.ts`（列表、创建、更新、pipeline、overdue）。
- 金额使用 `Prisma.Decimal`；API 返回字符串。
- 阶段流转调用 shared `assertDealStageTransition`。

### 6.3 完成标准

- API 测试全绿。
- 手工：创建 → 推进 → 赢单 → 客户/漏斗同步。

## 7. P0-6：商机 UI

### 7.1 测试先行

- `tests/web/unit/deal-pipeline.test.tsx`：
  - 渲染列、卡片、金额、逾期标识。
  - 空态引导。
  - 拖拽调用更新（mock API）。
- `tests/web/unit/customer-deals.test.tsx`：
  - 客户详情展示商机列表。
  - 新建商机表单校验。
  - 更新阶段后刷新。

### 7.2 实现

- `apps/web/src/lib/api/deals.ts`。
- `apps/web/src/types/deal.ts`。
- `apps/web/src/app/(dashboard)/deals/pipeline/page.tsx`。
- `apps/web/src/components/deals/DealPipeline.tsx`、`DealEditor.tsx`。
- 客户详情增加“商机”区块。
- 导航增加“商机管道”（获客组）。
- 空态、错误态、pending 纪律按 `docs/interaction-spec.md`。

### 7.3 完成标准

- 页面可用，无假数据。
- 移动端可用（列横向滚动）。
- 金额右对齐、`tabular-nums`。

## 8. P0-7：统一漏斗与内容 ROI

### 8.1 测试先行

- `tests/unit/shared/funnel-analytics.test.ts`：
  - 空数据全 0，不除零。
  - 各阶段计数、rateFromPrev/rateFromStart。
  - pipelineValue/wonRevenue/avgDealSize。
  - 无金额赢单不拉低客单价（分母只算有金额的）。
  - byChannel/byContent 聚合与排序。
- `tests/unit/shared/content-roi.test.ts`：
  - 互动/线索/客户/成交计数。
  - 去重客户。
  - 无 sourcePublishJobId 不计入。
  - 排序与截断 20 条。
- `tests/integration/api/funnel.test.ts`：
  - 组织隔离、时间窗口、渠道过滤、权限。

### 8.2 实现

- `packages/shared/src/funnel-analytics.ts`：纯聚合 `buildUnifiedFunnel(input)`。
- `packages/shared/src/content-roi.ts`：纯聚合 `buildContentRoi(input)`。
- `apps/api/src/services/funnel-analytics.ts`：查询并调用纯函数。
- `apps/api/src/routes-analytics.ts` 增加 `GET /api/analytics/funnel`。
- 扩展 `GET /api/analytics/content-roi`。
- `apps/web/src/app/(dashboard)/analytics/funnel/page.tsx`。
- 升级 `apps/web/src/app/(dashboard)/analytics/content/page.tsx`。
- 工作台增加 4 个指标卡。

### 8.3 完成标准

- 漏斗数字与数据库一致（用集成测试种子数据断言）。
- 内容分析标题与图表口径一致。
- 空态、错误态完整。

## 9. P0-8：能力矩阵

### 9.1 测试先行

- `tests/unit/shared/platform-capabilities.test.ts`：
  - 6 个平台都有条目。
  - 抖音 publish/prospecting 为 verified；其它平台不得全部 verified。
  - 状态值合法。
  - 每条 beta/unverified 有 note。

### 9.2 实现

- `packages/shared/src/platform-capabilities.ts`。
- `GET /api/platforms/capabilities`（可放 routes.ts）。
- `/integrations` 页面展示矩阵。
- 更新 `docs/delivery/crm-release-status.md` 的引用（如有必要）。
- 平台账号页的能力展示改为引用矩阵（若成本高，先加矩阵卡片并标注“以矩阵为准”）。

### 9.3 完成标准

- UI 与文档一致。
- 未验收状态不会被误标 verified。

## 10. P0-9：验证与交付

### 10.1 命令

```bash
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm vitest run tests/unit/shared/lifecycle.test.ts \
  tests/unit/shared/funnel-analytics.test.ts \
  tests/unit/shared/content-roi.test.ts \
  tests/unit/shared/platform-capabilities.test.ts
pnpm test:integration -- tests/integration/lifecycle-sync.integration.test.ts \
  tests/integration/api/deals.test.ts \
  tests/integration/api/funnel.test.ts \
  tests/integration/api/follow-ups-overdue.test.ts \
  tests/integration/api/lead-assign-notification.test.ts
pnpm test:web -- tests/web/unit/deal-pipeline.test.tsx \
  tests/web/unit/customer-deals.test.tsx \
  tests/web/unit/funnel-analytics.test.tsx
pnpm test:architecture
```

### 10.2 迁移检查

```bash
node scripts/with-e2e-database.mjs pnpm prisma migrate reset --force --skip-seed --schema packages/database/prisma/schema.prisma
node scripts/with-e2e-database.mjs pnpm prisma migrate diff --from-schema-datasource packages/database/prisma/schema.prisma --to-schema-datamodel packages/database/prisma/schema.prisma --exit-code
```

### 10.3 交付报告

必须包含：

- 改动清单（文件/模块）。
- 测试证据（命令、通过数）。
- 未完成项（P1/P2）。
- 风险与回滚方式。
- 真实平台验收状态（不得夸大）。

## 11. 进度跟踪

- [x] P0-0 文档基线（AGENTS.md、SPEC、Plan）
- [x] P0-1 生命周期纯函数（18 项单元测试）
- [x] P0-2 数据模型与迁移（空库重放通过、schema diff 为 0）
- [x] P0-3 结局同步服务（7 项集成测试）
- [x] P0-4 跟进 SLA 与逾期（4 项 API 测试）
- [x] P0-5 商机 API 与管道（7 项 API 测试）
- [x] P0-6 商机 UI（3 项 Web 测试）
- [x] P0-7 统一漏斗与内容 ROI（9 项共享单测 + 3 项 API 测试）
- [x] P0-8 能力矩阵（5 项单测 + 集成页展示）
- [x] P0-9 验证与交付（typecheck、lint、测试、build、架构守卫通过；E2E 浏览器闭环未执行，见交付记录）

实施结果与未完成项见
[`docs/delivery/2026-10-19-acquisition-closed-loop.md`](../docs/delivery/2026-10-19-acquisition-closed-loop.md)。

## 12. 回滚策略

- 代码：按切片独立提交，可用 `git revert` 单独回滚。
- 数据库：新增表和可空字段，线上回滚代码不需要删表；如需回滚迁移，先备份再执行反向 SQL。
- 回填：只创建缺失 Deal，可通过 `metadata.backfillSource` 定位并删除本次回填数据。
- UI：新页面有独立路由，回滚不影响旧页面。
- 能力矩阵：常量回退即可，不涉及数据。
