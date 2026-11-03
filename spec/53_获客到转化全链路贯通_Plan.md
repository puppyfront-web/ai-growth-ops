# 53 获客到转化全链路贯通 Plan

执行顺序：④ → ②③ → ①（感知优先，后做结构），每片独立验收、先红后绿。

## T4 UI 贯通（无 schema 改动）— 2026-11-03 已完成

> 交付证据：integration 54 files/385 tests 通过（含 `conversations-lead-summary.test.ts` 先红后绿）、web 30 files/176 tests 通过（含 `review-lead-card.test.tsx` 先红后绿）、typecheck/lint 通过。/prospecting/[id]「查看线索」入口因转化接口未返回 leadId 留待 T1（页面内有 TODO 注释）。

1. Red：`tests/web/unit/conversations/review-lead-card.test.tsx` — 有 leadSummary 渲染卡片+跳转链接；无则不渲染。
2. Red：`tests/integration/api/conversations-lead-summary.test.ts` — GET /api/conversations/:id 返回 leadSummary（含跨组织拒绝）。
3. Green：API 会话详情 include Lead 摘要；web `lib/api/conversations.ts` 类型与组件 `apps/web/src/components/conversations/LeadSummaryCard.tsx`；接入 review 页与 [id] 页。
4. /prospecting/[id] 转化后显示线索入口；/leads 行内"查看会话"链接。
5. 验收：`pnpm test:web -- tests/web/unit/conversations` + `pnpm test:integration -- tests/integration/api/conversations-lead-summary`。

## T2 回复回写线索

1. 迁移：`ReplySuggestion.leadId`（可空 + 索引）+ `ProspectCandidate.leadId`（一并加，T1 复用）。`pnpm db:generate`。
2. Red：`tests/unit/worker/interaction-reply-lead-writeback.test.ts` — 发送成功回写 lastContactedAt/LeadActivity/状态推进；失败不回写。
3. Red：`tests/integration/api/interaction-blocklist.test.ts` 旁新增会话详情 leadId 返回断言（如已覆盖则并入）。
4. Green：shared 增加 leadId 解析纯函数 + 状态流转；auto/manual reply 成功路径事务回写；生成建议时写入 leadId。
5. 验收：`pnpm vitest run tests/unit/worker/interaction-reply-lead-writeback.test.ts` + typecheck。

## T3 事件驱动状态机 — 2026-11-03 已完成

> 交付证据：`tests/unit/database/prospecting-plan.test.ts` 新增 lifecycle 纯函数用例（只升不降等级合并、NEW→QUALIFIED 状态推进，7+2 用例全绿）；`tests/integration/db/prospect-convert-creates-lead.test.ts` 断言转化事务内 Lead 状态推进与 `converted_from_prospect` LeadActivity。实现：`packages/database/src/lifecycle.ts` 新增 `mergeLeadLevelForConversion` / `leadStatusAfterProspectConversion` / `syncLeadConvertedTx`，由 `convertProspectToCustomer` 在同一事务内调用。

1. Red：`tests/unit/database/prospecting-plan.test.ts` 补用例：转化触发 lifecycle outcome 同步、幂等。
2. Green：`convertProspectToCustomer` 内调用 lifecycle 同步（事务内）。
3. 验收：受影响单测 + integration（转化路径）。

## T1 漏斗汇合 — 2026-11-03 已完成

> 交付证据：`tests/integration/db/prospect-convert-creates-lead.test.ts` 6 用例先红（5 failed）后绿——转化回填 `ProspectCandidate.leadId`、Lead 存在且组织隔离、NEW→QUALIFIED + LeadActivity、不降级（既有 CONTACTED Lead 保持）、同平台同外部用户去重复用（Lead count=1）、跨组织转化拒绝；integration 55 files/391 tests、unit 741 tests、web 176 tests、typecheck、lint 全通过。转化响应回传 `leadId`，/prospecting/[id] 转化成功提示与详情面板（ConvertedBadge）接入「查看线索」真实链接。注：无新迁移（T2 已落 `ProspectCandidate.leadId` 列）；文件尺寸守卫冻结基线因 spec/53 系列交付更新（routes.ts 7126、prospecting.ts 1962，见 file-size-guard 注释）。

1. Red：`tests/integration/db/prospect-convert-creates-lead.test.ts` — 转化创建/关联 Lead、回填 leadId、幂等、组织隔离。
2. Green：`convertProspectToCustomer` upsert Lead（平台+外部用户 ID 去重，organizationId 过滤），回填 `ProspectCandidate.leadId`；/prospecting/[id] 展示线索入口接线到真实数据。
3. 验收：integration + `pnpm test:unit` + typecheck + lint；迁移 `prisma migrate diff` 无漂移。

## 回归

`pnpm typecheck && pnpm lint`；受影响测试全量；更新 `docs/delivery/crm-release-status.md` 与本 Plan 勾选状态。
