# 11. 获客闭环 P1/P2 开发 Plan

> 关联：[10_获客闭环P1P2_Roadmap_SPEC.md](./10_获客闭环P1P2_Roadmap_SPEC.md)
> 状态：规划，未开始实施
> 方式：每个能力单独走 SDD → TDD → 交付记录；不在一个 PR 里混合多个能力。

## 0. 执行原则

1. 一次只做一个 P1 能力，完成验收后再开下一个。
2. 先补数据模型和状态机测试，再写 UI。
3. 外部发送类能力默认 `manual_confirm`，能力矩阵未 `verified` 时禁止自动发送。
4. 每个能力必须有停止条件、频控、退订/黑名单、审计。
5. P1 完成后更新 `docs/delivery/`，未验收项不得标为完成。

## 1. P1-A：触达序列 + 团队 SLA

### 1.1 任务顺序

| 步骤 | 任务 | 测试先行 | 产出 |
| --- | --- | --- | --- |
| A1 | 触达状态机与频控纯函数 | `tests/unit/shared/outreach.test.ts` | `packages/shared/src/outreach.ts` |
| A2 | Outreach schema/migration | 迁移重放 | `outreach_*` 表 |
| A3 | 序列 CRUD 与 enrollment 服务 | `tests/integration/outreach-sequences.test.ts` | `packages/database/src/outreach.ts` |
| A4 | 触达队列与发送 Provider 接口 | `tests/integration/api/outreach-touches.test.ts` | `apps/api/src/routes-outreach.ts`、worker handler |
| A5 | 退订/黑名单/频控 | `tests/unit/shared/outreach-guard.test.ts` | `outreach_suppressions` |
| A6 | 自动分配与 SLA 升级 | `tests/integration/api/lead-assignment-rules.test.ts` | `assignment_rules`、定时任务 |
| A7 | 销售工作台与客户触达卡片 | `tests/web/unit/outreach-*.test.tsx` | `/outreach`、客户详情区块 |

### 1.2 验收命令

```bash
pnpm vitest run tests/unit/shared/outreach.test.ts
pnpm test:integration -- tests/integration/outreach-sequences.test.ts
pnpm test:web -- tests/web/unit/outreach-workbench.test.tsx
pnpm typecheck && pnpm lint
```

### 1.3 完成定义

- 一个 3 步序列可创建、排期、暂停、回复后停止。
- 退订/频控/静默期全部生效并有测试。
- 未验收渠道只生成人工任务。
- 分配规则与 SLA 升级可在通知中心看到。

## 2. P1-B：小红书获客 + 线索合并

### 2.1 任务

1. 平台适配器 contract test（搜索、评论、证据、限流）。
2. 能力矩阵把小红书 `prospecting` 从 `unverified` 提升到 `beta/verified`，同步文档。
3. `ProspectingTask` 增加定时配置与 `lastRunAt`。
4. 跨渠道身份匹配与合并服务（手机号优先，平台身份次之）。
5. 合并 UI、审计、回滚。
6. 测试：平台 contract、定时幂等、合并迁移、组织隔离。

### 2.2 完成定义

- 小红书任务可真实采集并保留证据。
- 同一人从抖音和小红书进入时可合并，来源不丢。
- 合并后商机/线索/互动全部指向主客户。

## 3. P1-C：培育与表单 + 自动分配

### 3.1 任务

1. Lead magnet 与表单模型、公开提交接口（带组织 slug/token）。
2. 表单提交进入 Interaction 流水线，复用评分/去重。
3. 培育序列触发条件与停止条件。
4. 自动分配规则（渠道/行业/地区/负载）。
5. 管理者负载视图。

### 3.2 完成定义

- 表单提交可创建/关联客户，来源可追溯。
- 培育事件（打开/点击/下载）进入漏斗。
- 自动分配有规则、有通知、有超时升级。

## 4. P2-A：成本与多触归因

### 4.1 任务

1. 成本录入（渠道/内容/人工）与权限。
2. 归因模型纯函数：首触、末触、线性。
3. 漏斗增加 CPL/CAC/ROI/回收周期。
4. 口径说明与空数据保护。
5. 测试：归因边界、成本为 0、跨组织隔离。

### 4.2 完成定义

- 同一笔成交可用三种归因模型解释，口径在 UI 可见。
- 成本为 0 或缺失时不除零、不误报 ROI。

## 5. P2-B：外部 CRM / 预测 / A/B

### 5.1 任务

1. 外部 CRM 双向同步映射与冲突策略。
2. 销售预测（阶段概率 × 金额 × 预计成交日）。
3. A/B 测试分流、样本量与显著性提示。
4. 数据仓库导出（事件表 + 维度表）。

### 5.2 完成定义

- 外部 CRM 同步幂等，冲突可解释、可回滚。
- 预测结果标注假设和置信度。
- A/B 结果不夸大显著性。

## 6. 交付节奏

| 里程碑 | 内容 | 预计 |
| --- | --- | --- |
| M1 | 触达序列 + SLA | 3–4 周 |
| M2 | 小红书 + 合并 | 3–4 周 |
| M3 | 培育/表单 + 自动分配 | 3 周 |
| M4 | 成本/归因/预测 | 4 周 |
| M5 | 外部 CRM / A/B / 数仓 | 4–6 周 |

## 7. 实施结果（2026-10-19）

- [x] P1-A 触达序列 + SLA：模型、服务、API、Worker 扫描、UI、退订/频控/静默期、SLA 升级
- [x] P1-B 客户合并、定时获客任务、小红书 Beta 闸门
- [x] P1-C 表单捕获、公开提交、自动分配规则
- [x] P2-A 成本录入、CPE/CAC/ROI、首触/末触/线性归因
- [x] P2-B 销售预测、A/B 实验、数仓 JSON 导出、通用 CRM Webhook
- [x] A/B 分流默认接入业务路径：发布任务创建分配 content_item、触达发送分配 customer、商机赢单记 won 事件、线索转化记 lead 事件（`tests/integration/experiment-wiring.integration.test.ts`）
- [x] 获客闭环 E2E：潜客→客户→商机→赢单→漏斗→内容分析（`tests/e2e/flow-deal-close-loop.e2e.test.ts`，Mock 数据不触达真实平台）
- [ ] 真实平台发送/回复（需逐账号验收；验收程序已就绪，见
  [`docs/delivery/real-platform-acceptance-runbook.md`](../docs/delivery/real-platform-acceptance-runbook.md)，
  等待用户提供低风险测试账号与书面批准）
- [ ] 小红书真实账号主动获客验收（同上 Runbook 第 3.3 节）

### 降范围决定（2026-10-19）

**不构建厂商专用 CRM 双向连接器（HubSpot/纷享销客等）。** CRM 集成维持两条通用通道作为正式交付面：

1. 出站：Webhook 事件（`customer.created/won/lost`、`deal.won/lost`、`lead.created`），带 HMAC 签名与重试；
2. 入站：`/api/leads/webhook/ingest`（token 校验）。

理由：单公司自用场景下，厂商连接器需要目标厂商账号与字段映射需求逐一确认，维护成本高于通用通道收益；任何一方后续提出具体厂商需求时，按新 SPEC 立项（Webhook 载荷已具备扩展点）。原计划中该项从"未完成"移出，标记为**有意降范围**，不再视为本路线图待办。

证据与未完成项见
[`docs/delivery/2026-10-19-acquisition-p1p2.md`](../docs/delivery/2026-10-19-acquisition-p1p2.md)。

## 8. 风险

| 风险 | 缓解 |
| --- | --- |
| 外部发送导致账号风控 | 默认人工确认、频控、静默期、能力矩阵闸门 |
| 合并误伤客户 | 人工确认、审计、可回滚、来源全保留 |
| 多平台适配器不稳定 | contract test + beta 标记 + 低量灰度 |
| 归因口径争议 | 口径文档 + 多模型并列 + 不单一宣称 |
| 外部 CRM 冲突 | 字段级映射、冲突队列、人工裁决 |
