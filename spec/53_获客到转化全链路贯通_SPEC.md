# 53 获客到转化全链路贯通 SPEC

## 背景

用户反馈：智能获客产出潜客后，与后续环节（线索跟进、触达/回复、转化、沉淀）体验上是断开的。审查确认四处真实断点：

1. **两套平行漏斗**：主动获客只写 `ProspectCandidate`（无 Lead 外键），转化走 `convertProspectToCustomer` 直接 → Customer，跳过 Lead。评论区互动进 Lead，爬取潜客进 ProspectCandidate，互不相通。
2. **回复与线索零关联**：`ReplySuggestion`/`ReplyAttempt` 只挂 `interactionId`（schema.prisma:1908-1945）；`interaction.auto-reply.ts` / `interaction.manual-reply.ts` 无任何 lead 回写——不更新 `Lead.lastContactedAt`/状态，不产生 `LeadActivity`。
3. **状态机仅手动触发**：`packages/database/src/lifecycle.ts` 的 `syncLeadOutcomeTx` 等只在 `routes.ts:3523`（UI 手动改状态）被调用。
4. **UI 孤岛**：conversations 审核页无任何到 leads 的链接；prospecting / leads / conversations 三页互不跳转。

## 目标

让用户在系统内直观感受到"获客 → 识别 → 跟进 → 转化"是一条连贯链路：

- G1 会话审核页可见对方线索画像（评分、状态、来源），可一键跳线索详情。
- G2 回复（自动/人工）发送成功后回写 Lead：更新 `lastContactedAt`、写 `LeadActivity`、按状态机推进状态。
- G3 状态机由真实业务事件（回复发送、潜客转化）自动驱动，不再只靠手动。
- G4 潜客转化时生成/关联 Lead，两套漏斗在 Lead 层汇合；分析口径随之统一。

## 非目标

- 不实现真实平台自动回复的新能力（仍受 spec 47 / 未验收边界约束）。
- 不重写历史迁移；不改动未验收平台的能力声明。
- 不合并 ProspectCandidate 表为 Lead 的视图（保留表，只补汇合点）。

## 数据模型

- `ReplySuggestion` 新增 `leadId String?` + `@@index([leadId])` + Lead 关系（可空，历史数据兼容）。
- `ProspectCandidate` 新增 `leadId String?` + `@@index([leadId])` + Lead 关系（转化时回填）。
- 迁移 `20261103xxxxxx_reply_lead_linkage/`，纯增列，可重放。

## 行为定义

### G2 回复回写
- 回复发送成功（ReplyAttempt.status=success）后，在事务内：
  - `lead.update({ lastContactedAt: now })`（若 leadId 可解析）；
  - 写 `LeadActivity(type: 'reply_sent', ...)`；
  - 状态机：`new`/`assigned` → `contacted`（复用 lifecycle 状态流转，非法流转跳过）。
- leadId 解析顺序：ReplySuggestion.leadId → Interaction→Lead(sourceInteractionId)。

### G3 事件驱动状态机
- 潜客转化成功（convertProspectToCustomer）时调用 lifecycle 同步 Lead outcome（lead → customer 转化路径）。
- 回复事件驱动见 G2。

### G4 漏斗汇合
- `convertProspectToCustomer` 改为：转化事务内 upsert Lead（按平台 + 外部用户 ID 去重），回填 `ProspectCandidate.leadId`，Customer 与 Lead 通过既有 customerId 关系保持一致。
- 获客分析（spec 51/52 快照收割）保持 ProspectCandidate 侧不变；Lead 侧效率分析可经 `ProspectCandidate.leadId` 贯穿。

### G1 UI 贯通
- 会话审核页（/conversations/review、/conversations/[id]）：若互动已关联 Lead，展示线索卡片（评分徽章、状态、来源任务），点击跳 `/leads/[id]`。
- /prospecting/[id] 潜客详情：转化后显示关联线索入口。
- /leads 列表行：若线索来自互动，显示"查看会话"链接。

## API

- 会话/回复相关 GET 响应在服务端补充关联 Lead 摘要（避免前端 N+1）：`GET /api/conversations/:id` 返回 `leadSummary`（id、status、score、source）。
- 不新增路由；仅扩展现有响应字段。

## 验收标准

- A1 审核页对已建线索的互动展示线索卡片并跳转；无线索互动不显示（空态不出现假按钮）。
- A2 自动回复成功后，集成测试断言 Lead.lastContactedAt 更新、LeadActivity 生成、状态 new→contacted。
- A3 手动回复（manual-reply）同样回写（A2 同款断言）。
- A4 转化成功后 ProspectCandidate.leadId 非空，Lead 存在且状态机 outcome 同步；转化幂等（重复转化不重复建 Lead）。
- A5 历史数据兼容：leadId 为空的旧建议/潜客全部路径不报错。
- A6 全量 typecheck/lint/受影响测试通过；迁移空库可重放。

## 测试矩阵

| 层 | 用例 |
| --- | --- |
| shared 纯函数 | leadId 解析顺序、状态流转合法性 |
| integration/api | 会话详情返回 leadSummary；跨组织拒绝 |
| integration/db | 回复回写事务、转化→Lead upsert 幂等 |
| worker 单元 | auto/manual reply 成功/失败路径回写与否 |
| web 单元 | 审核页线索卡片渲染、空态、跳转链接 |
