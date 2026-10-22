# AGENTS.md

本文件是 AI 编码代理在本仓库工作的最高优先级约定。开始任何任务前先读本文件；与本文件冲突的临时指令，先向用户确认。

## 1. 项目定位与当前边界

AI Growth Ops 是**单公司/单品牌自用**的多平台获客运营系统：内容生产与发布、评论私信承接、关键词获客、客户/线索管理、飞书/企微沉淀、获客分析。

当前产品边界（不要在对外文案中扩大）：

- 已稳定验证：账号扫码登录、抖音关键词/评论区采集、语义打分、客户去重入库、内容发布链路。
- 部分验证：评论/私信同步、回复建议与人工审核、飞书/企微同步。
- 未稳定验证：多平台主动获客、真实自动回复、真实飞书写入、备份恢复演练。未验证的能力必须标为 `beta` / `未验收`，不得写成“支持”。
- 主动获客前端当前只开放抖音（`PROSPECTING_SUPPORTED_PLATFORMS`）；小红书等平台虽在 browser-runner 有基础实现，也不得默认宣称可用。

产品边界与真实证据以 `docs/delivery/crm-release-status.md` 为准。任何“已完成/可上线”的结论必须有命令输出、测试结果或真实外部 ID 作为证据。

## 2. 技术栈与仓库结构

- Monorepo：pnpm workspace + TypeScript + Node.js 22.12+。
- `apps/web`：Next.js App Router + React Query + Tailwind/shadcn 风格组件。
- `apps/api`：Node HTTP 路由（`apps/api/src/routes.ts` 及 `routes-*.ts`）+ Zod 校验。
- `apps/worker`：BullMQ Worker。
- `apps/browser-runner`：Playwright/CDP 浏览器自动化。
- `packages/database`：Prisma Client、schema、migrations、领域数据服务。
- `packages/shared`：无副作用共享类型、常量、纯函数（评分、漏斗、状态机等）。
- `packages/runtime`：runtime-agnostic Agent 内核，**禁止反向依赖 `apps/*`**。
- `packages/*`：providers、connectors、skills、ai、lead-sinks、observability 等适配层。
- `spec/`：SDD 规格与计划；`docs/`：交付、部署、交互规范。

## 3. 常用命令

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test                 # 后端单元/集成 + Web 单元
pnpm test:unit
pnpm test:web
pnpm test:integration     # 需要 e2e 数据库，脚本会自动切换 DATABASE_URL
pnpm test:architecture    # 架构守卫
pnpm build
pnpm db:generate
pnpm db:migrate
pnpm db:deploy
pnpm verify:release       # 完整发布门禁，耗时较长
```

单文件测试优先：

```bash
pnpm vitest run tests/unit/shared/xxx.test.ts
pnpm test:web -- tests/web/unit/xxx.test.tsx
pnpm test:integration -- tests/integration/xxx.test.ts
```

测试数据库只能通过 `scripts/with-e2e-database.mjs` 或 `pnpm test:integration` 使用；禁止把应用库当测试库，禁止重置业务库。

## 4. SDD + TDD 工作流

任何非平凡改动按以下顺序执行，不得跳阶：

1. **Spec**：在 `spec/` 新增或更新编号文档，写清背景、目标、非目标、数据模型、API、UI、验收标准、测试矩阵。
2. **Plan**：在 `spec/` 写任务计划，按“先测试、后实现”的顺序拆分，标注依赖、文件、验收命令。
3. **Red**：先写失败测试。纯逻辑放 `packages/shared`；数据库行为放 `tests/integration`；路由行为放 `tests/integration/api`；页面行为放 `tests/web/unit`。
4. **Green**：最小实现让测试通过。
5. **Refactor**：消除重复、统一命名、补边界测试，保持现有风格。
6. **Verify**：运行受影响测试 + `pnpm typecheck` + `pnpm lint`；涉及迁移时运行迁移链检查。
7. **Report**：列出改动、测试证据、未完成项与风险。未运行或失败的项目必须如实写明。

TDD 规则的例外：纯文档、纯样式调整、一次性数据脚本可以不写测试，但仍需说明验证方式。

## 5. 架构边界

- `packages/runtime` 不得 import `apps/*`；架构守卫会报错。
- 新业务优先复用现有领域服务和 Prisma 事务，不引入新的通用编排框架。
- 跨模块共享的纯逻辑放 `packages/shared`，不要在 Web/API/Worker 各写一份。
- API 与 Worker 共用 `packages/database` 的模型解析与领域函数。
- 旧 `Workflow/Campaign/Runtime` 执行链仅作兼容保留；新增业务不要依赖 `workflow.execute`。
- 不新增 `any`、`@ts-ignore`、ESLint 禁用注释来绕过错误；确需例外时写明原因并加测试。
- 不删除历史表/字段/来源关系；迁移必须可重放、可回滚或提供恢复说明。

## 6. 数据与迁移

- Prisma schema：`packages/database/prisma/schema.prisma`。
- 迁移目录：`packages/database/prisma/migrations/<timestamp>_<snake_case>/migration.sql`。
- 新增字段默认允许 `NULL` 或提供安全默认值；新表必须有 `organizationId`（除全局配置表）和必要索引。
- 业务表统一：`id String @id @default(uuid())`、`createdAt`、`updatedAt`、`deletedAt`（软删除）、`metadata Json?`。
- 所有查询必须带 `organizationId` 过滤；跨组织读写视为 P0 缺陷。
- 状态流转必须集中在纯函数/领域服务中，并配状态机单元测试。
- 金额使用 `Decimal @db.Decimal(14, 2)` 或整数分，禁止 `Float`。
- 多步写入必须使用 Prisma 事务；去重/结账类操作使用 advisory lock 或唯一约束兜底。
- 迁移后必须运行 `pnpm db:generate`；不要手改 `node_modules/.prisma`。

## 7. API 约定

- 路由定义在 `apps/api/src/routes*.ts`，使用 `{ method, pattern, handler }`。
- 入参必须 Zod 校验（`apps/api/src/schemas/*.ts`），禁止直接信任 `ctx.body`。
- 统一响应：成功 `sendJson(res, 200, payload)`；错误 `sendJson(res, 4xx, { error })`。
- 权限：先 `getOrganizationContext`，再 `hasPermission`；写操作使用 `lead:edit` / `settings:manage` 等已有权限，不新增角色。
- 列表接口统一 `parsePagination` + `paginate`，返回 `{ items, total, page, pageSize }`。
- 所有路由必须组织隔离；外部 webhook 走 token/签名校验。
- 异步动作返回 `202 { queued: true }`，不要在前端假装同步完成。
- 关键写操作写 `AuditLog` 或领域活动记录。

## 8. Web UI 约定

- 遵循 `docs/interaction-spec.md` 与 `docs/ui-ux-upgrade-plan.md`。
- 数据请求集中在 `apps/web/src/lib/api/*`，使用 React Query；禁止页面内裸 `fetch`（内部 BFF 除外）。
- 成功反馈：轻操作 toast；创建/编辑后跳转详情或列表；长任务进详情页看进度。
- 空态用 `EmptyState`，错误用 `ErrorState`，加载用 `LoadingState`/骨架；禁止裸“暂无数据”。
- 表单按钮 pending 只禁用触发按钮；破坏性操作按 L1/L2/L3 分级确认。
- 金额、数量右对齐并使用 `tabular-nums`；时间统一走 `lib/format.ts`。
- 中文文案：动词 + 宾语；错误说明原因和下一步；不用感叹号。
- 不做“看起来能用但没接后端”的按钮；未实现能力明确标 `即将支持` / `未验收`。

## 9. 安全与隐私

- 不在日志、错误响应、测试快照中输出明文密钥、cookie、token、手机号全量。
- 凭据只能服务端解密；HTTP 响应不得返回明文密钥。
- 生产默认密码、默认端口暴露、`CHANGE_ME` 值视为阻断项。
- 外部平台自动化必须遵守频控与验证码守卫；不得实现规避风控、批量骚扰、未授权抓取。
- 触达/回复必须有退订、黑名单、频控；高风险内容必须人工确认。
- 新增外部依赖前确认许可证与维护状态；不得引入来源不明的抓取/破解库。

## 10. 平台能力诚实原则

任何平台能力在以下证据齐备前只能标为 `未验收`：

1. 授权账号完成登录健康检查；
2. 低量真实采集/发布/回复成功；
3. 记录外部 ID、时间、截图/日志；
4. 失败路径有明确错误码和恢复指引。

对外文档、UI 文案、销售材料必须引用同一份能力矩阵。禁止用 Mock、空库迁移、单元测试代替真实平台验收。

## 11. 测试规范

- 纯函数：边界、空值、极端值、状态机非法流转。
- 领域服务：幂等、去重、事务回滚、组织隔离、并发冲突。
- API：401/403/400/404/409/成功路径，跨组织拒绝。
- Web：关键交互、空态、错误态、pending 纪律；不写镜像实现的测试。
- E2E：只覆盖跨模块关键闭环，使用精确测试账号；不向真实平台发帖/回复，除非用户明确批准。
- 测试名用中文或英文均可，但必须描述行为，不写“test1”。

## 12. Definition of Done

一个任务完成必须同时满足：

- [ ] 对应的 Spec/Plan 已更新；
- [ ] 新增/修改行为有测试，且先红后绿；
- [ ] `pnpm typecheck`、`pnpm lint`、受影响测试通过；
- [ ] 涉及迁移时，空库可重放且 `prisma migrate diff` 无漂移；
- [ ] 涉及权限/组织隔离时有拒绝路径测试；
- [ ] UI 有空态、错误态、pending 态；
- [ ] 没有未说明的 `any`、吞错、硬编码密钥；
- [ ] 交付报告写明证据、未完成项和风险。

## 13. 已知限制与禁止事项

- 不要把“找到潜客”写成“完成获客”；没有触达和成交记录就不是闭环。
- 不要新增第二套线索/客户状态而不做同步；当前 Lead 与 Customer 状态必须通过领域服务保持一致。
- 不要在未验证平台时扩大 `PROSPECTING_SUPPORTED_PLATFORMS`。
- 不要用前台假数据、延时 toast、Mock Provider 冒充真实成功。
- 不要删除或重写历史迁移；新增迁移只做增量。
- 不要在 `packages/runtime` 引入 `apps/*` 依赖。
- 不要把飞书/企微当主数据库；主数据始终在 PostgreSQL。

## 14. 文档索引

- 需求与历史规格：`spec/00` ~ `spec/07`
- 获客闭环专业化规格与计划：`spec/08_获客闭环专业化_SPEC.md`、`spec/09_获客闭环专业化_Plan.md`
- P1/P2 路线图与计划：`spec/10_获客闭环P1P2_Roadmap_SPEC.md`、`spec/11_获客闭环P1P2_Plan.md`
- 获客闭环 P0 交付记录：`docs/delivery/2026-10-19-acquisition-closed-loop.md`
- 获客闭环 P1/P2 交付记录：`docs/delivery/2026-10-19-acquisition-p1p2.md`
- 真实平台验收 Runbook（含批准模板）：`docs/delivery/real-platform-acceptance-runbook.md`
- 交付状态：`docs/delivery/crm-release-status.md`
- 交互规范：`docs/interaction-spec.md`
- 部署：`docs/deployment.md`
- 本地数据边界：`docs/delivery/local-first-data-boundary.md`
