# 获客闭环 P1/P2 交付记录

日期：2026-10-19
关联规格：[spec/10_获客闭环P1P2_Roadmap_SPEC.md](../../spec/10_获客闭环P1P2_Roadmap_SPEC.md)
关联计划：[spec/11_获客闭环P1P2_Plan.md](../../spec/11_获客闭环P1P2_Plan.md)
前置交付：[2026-10-19-acquisition-closed-loop.md](./2026-10-19-acquisition-closed-loop.md)

## 1. 交付范围

本次按计划完成 P1-A、P1-B、P1-C、P2-A、P2-B 的内部能力建设。**外部平台真实发送/写入仍需逐账号验收**，未验收能力在 UI 与能力矩阵中保持 Beta/未验收。

### P1-A 触达序列 + SLA

- 新增 `outreach_sequences`、`outreach_steps`、`outreach_enrollments`、`outreach_touches`、`outreach_suppressions`、`assignment_rules`。
- 支持多步序列、延迟、模板变量、报名/暂停/继续/取消、触达完成/跳过/已回复。
- 频控：同一客户每天最多 1 次、每周最多 3 次；静默期默认 22:00–08:00。
- 退订/黑名单按客户/邮箱/手机号命中；命中后拒绝报名与发送，但允许记录跳过。
- 渠道闸门：`manual` / `phone_task` 默认可用；`email` / `wecom` / `official_dm` 默认未验收，只允许在管理员显式配置为 `verified` 后发送。
- SLA：逾期 Lead/Customer/Deal 定时升级，写站内通知并记录 `slaEscalatedAt`，重复扫描不重复通知。
- Worker 新增 `outreach.check`，每 5 分钟扫描到期触达与逾期跟进。
- UI：`/outreach` 触达工作台（待触达、序列、退订名单、渠道能力），客户详情新增“触达序列”卡片。

### P1-B 多平台获客 + 客户合并

- 小红书主动获客进入 Beta：前端默认仍只展示抖音；切换到小红书必须显式勾选风险确认，API 校验 `confirmBeta`。
- 能力矩阵中小红书主动获客标记为 `beta`，不宣称已验证。
- `ProspectingTask` 新增定时执行：`scheduleEnabled`、`scheduleIntervalHours`、`nextRunAt`、`lastRunAt`。
- Worker 新增 `prospecting.schedule`，每 15 分钟领取到期任务；额度、验证码、账号失效会跳过并记录原因。
- 客户合并：按手机号/同名同渠道查找重复客户；合并迁移 Lead、Deal、ProspectCandidate、OutreachEnrollment、LeadCaptureSubmission，源客户软删除并保留审计活动。
- UI：客户详情新增“疑似重复客户”面板；任务详情新增“定时执行”设置。

### P1-C 表单获客 + 自动分配

- 新增 `lead_capture_forms`、`lead_capture_submissions`。
- 公开表单：`GET /api/public/forms/:slug`、`POST /api/public/forms/:slug/submit`，按 IP 限流。
- 提交后按手机号去重创建/关联客户，写入表单提交记录，通知负责人。
- 自动分配规则：按渠道/等级/行业/地区匹配；固定负责人或按当前负载分配给最空闲成员。
- 手工线索创建、互动自动转线索、主动获客转客户、表单提交都接入了自动分配。
- UI：`/forms` 表单与分配规则管理，公开页面 `/f/:slug`。

### P2-A 成本与多触归因

- 新增 `marketing_costs`，支持渠道、内容、类型、金额、发生时间、备注。
- `GET /api/analytics/efficiency`：总投入、收入、CPL、CAC、ROI、渠道效率、成本分类。
- `GET /api/analytics/attribution`：首触/末触/线性归因，基于线索首触与触达记录。
- 纯函数 `attributeRevenue` 处理无触达、零金额、多笔成交与内容归因。
- UI：`/analytics/efficiency` 成本录入、渠道效率、归因结果、成本明细。

### P2-B 预测、A/B、CRM/数仓

- 销售预测：`GET /api/analytics/forecast`，按阶段概率加权、按月桶、输出 expected/committed/best/worst。
- A/B 实验：`experiments`、`experiment_assignments`、`experiment_events`。
  - 稳定哈希分流、幂等分配、事件记录、转化率/提升/p 值。
  - 样本不足（每组 <30）或 p≥0.05 时不宣布胜出。
- 数仓导出：`GET /api/export/warehouse.json?days=90`，一次导出客户、线索、商机、互动、成本、触达、实验。
- 外部 CRM：复用现有 Webhook 体系，新增 `customer.created`、`customer.won/lost`、`deal.won/lost`、`lead.created` 事件；入站继续使用 `/api/leads/webhook/ingest`。**未实现厂商专用双向连接器**（HubSpot/纷享销客等）。
- UI：`/experiments` 实验列表、启动/结束、结果表；效率页新增销售预测。
- **A/B 分流已接入业务默认路径**（全部 best-effort，失败不阻断业务动作）：
  - 曝光分配：发布任务创建（单个/批量，`POST /api/publish-jobs`）为 content_item 分配变体；触达发送（`completeOutreachTouch` status=sent）为 customer 分配变体。
  - 转化事件：商机赢单（`syncDealOutcomeTx`）记录 `won` 事件（按 deal id 去重）；互动转线索（Worker 流水线与 `/api/interactions/:id/convert-to-lead`）经 `recordLeadConversionForPublishJob` 记录 `lead` 事件（按 lead id 去重）。
  - 指标匹配：事件只计入 metric 与事件类型一致的运行中实验（如 metric=won 的实验只统计赢单）。
  - 集成测试：`tests/integration/experiment-wiring.integration.test.ts`（6 项：发布分配、批量幂等、草稿不分配、触达分配、赢单事件+指标过滤、线索事件+去重）。

## 2. 迁移

新增迁移：

- `20261019120000_outreach_sequences`
- `20261019140000_lead_capture_forms`
- `20261019160000_prospecting_schedule`
- `20261019180000_marketing_costs`
- `20261019200000_experiments`

验证：

```bash
pnpm db:reset:test
node scripts/with-e2e-database.mjs sh -c 'pnpm prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel packages/database/prisma/schema.prisma --exit-code'
# No difference detected.
pnpm db:deploy   # 已应用到本地开发库
```

## 3. 测试证据

新增测试：

- 单元：`outreach`、`attribution`、`forecast`、`experiment`、`platform-capabilities`、`lifecycle`、`funnel-analytics`、`content-roi`。
- 集成：outreach 服务与 API、lead capture、customer merge、costs/efficiency/attribution、experiments/warehouse、experiment wiring（业务路径分流与转化事件）、lifecycle sync、backfill。
- Web：deal pipeline、customer deals、funnel、customer outreach 相关页面/组件。

全量结果（本次执行，含 A/B 接线回归）：

```text
pnpm typecheck       通过（19 个 workspace）
pnpm lint            通过
pnpm vitest run      127 个文件 / 842 项通过
pnpm test:web        21 个文件 / 127 项通过
pnpm build           通过
pnpm test:architecture 通过（8 个既有兼容警告）
pnpm test:e2e        14 项通过（13 项既有 + 闭环 E2E flow-deal-close-loop）
```

E2E 说明：新增导航模块使单屏用户引导的主按钮被挤出视口，导致首轮 13 个用例在
登录引导处超时；已将引导改为限高 + 模块列表滚动 + 底部操作栏固定，重跑全部
通过。修复位于 `apps/web/src/components/shared/UserGuide.tsx`，并为全部新模块
补充了引导描述。

## 4. 未完成 / 未验收

- **真实平台发送/回复**：触达的 `email` / `wecom` / `official_dm` 默认未验收，未接入真实发送 Provider；抖音评论回复的真实验收待用户按 Runbook 提供测试账号与书面批准。
- **小红书主动获客**：仅 Beta 闸门与定时任务；未完成真实账号低量验收（Runbook 3.3）。
- **数仓导出**：JSON 单文件导出，未实现增量同步/CDC。
- **恢复演练与稳定性观察**：仍按 P0 交付记录中的阻断项执行。

> A/B 分流接入业务路径已在本轮完成（见第 1 节），不再列为未完成项。
> 事件去重为应用层检查（metadata.dedupeKey），高并发下同一转化的极端并发
> 重复最多产生一次重复事件，不影响显著性判定的保守性。

### 降范围决定：不构建厂商专用 CRM 连接器

原"厂商专用 CRM 双向连接器（HubSpot/纷享销客）"从待办移出，标记为**有意降范围**
（决定记录见 `spec/11` 第 7 节）。CRM 集成的正式交付面为：
出站 Webhook（HMAC 签名 + 重试，事件 `customer.created/won/lost`、`deal.won/lost`、
`lead.created`）与入站 `/api/leads/webhook/ingest`（token 校验）。后续如出现具体
厂商需求，按新 SPEC 立项。

### 真实平台验收：程序已就绪

逐账号验收的完整程序、书面批准模板、证据要求与能力矩阵更新步骤见
[`real-platform-acceptance-runbook.md`](./real-platform-acceptance-runbook.md)。
执行前置条件：用户提供低风险测试账号 + 填写批准单（`docs/delivery/acceptance-evidence/APPROVAL-TEMPLATE.md`）。
在获得批准前，按 `AGENTS.md` 不得向真实平台发送，相关能力保持 Beta/未验收。

只读就绪检查：`pnpm acceptance:readiness`（不发送任何内容）。2026-10-20 实测快照：
抖音账号「黄鸭」在线健康、API/browser-runner/worker/DB/Redis 全部在线，评论与私信
只读同步均 completed（各 fetched 0——已发布视频暂无评论、账号无私信，回复验收缺
真实目标）；飞书 lead sink 为 mock 种子配置（连通性测试鉴权失败，需填真实凭据）；
小红书无账号。即：抖音回复需先由任一其他账号留一条测试评论/私信，飞书写入需先
配置真实应用凭据，随后填写批准单即可执行两项验收。

## 5. 风险

| 风险 | 缓解 |
| --- | --- |
| 触达误发 | 默认人工确认；未验收渠道不可发送；频控/静默期/退订校验 |
| 自动分配不均 | 按未关闭线索/客户负载选择；规则可停用 |
| 合并误伤 | 人工确认、源客户软删除、活动审计、来源关系全迁移 |
| 归因口径争议 | 首触/末触/线性并列展示；未归因金额单独标注 |
| A/B 误判 | 每组至少 30 样本且 p<0.05 才宣布胜出 |
| A/B 事件重复计数 | 按业务键（deal/lead id）应用层去重；接线 best-effort 不阻断业务 |
| 定时任务绕过额度 | 领取前检查账号、额度、验证码；失败记录原因并顺延 |
