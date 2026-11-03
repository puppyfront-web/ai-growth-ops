# 51. 潜客转化结果分析（评分快照收割第一批）SPEC

> 状态：已实施（2026-11-03）
> 关联：[41_评分快照埋点](./41_评分快照埋点_SPEC.md)（P0-3 的种子，本批开始收割）、founding engineer 评审「数据飞轮」
> 背景：快照埋点已落库（metadata.scoring / conversionSnapshot），但无任何读取方。本批回答第一个飞轮问题：**哪类评分/画像的潜客真的走向了赢单**。

## 1. 目标

- G1 `packages/database/src/prospect-outcomes.ts`：`getProspectOutcomeAnalytics(db, organizationId, days)` —— 按转化时刻口径（有 conversionSnapshot 用快照，否则用当前行值，历史行兼容）聚合：
  - byLevel：leadLevel A-D → { candidates, converted, won, wonRate }
  - byPersona：personaTag → 同上（无画像归「未判定」）
  - byScoringVersion：版本分布（快照覆盖率观察）
  - summary：总数/转化数/赢单数/整体赢单率 + 快照覆盖率
  - 赢单判定：candidate.customerId → Customer → Deal.stage='won'（任一商机赢单即计，关联 customer.metadata.prospectCandidateId 或 customerId 链路对齐转化快照归属）
- G2 API：`GET /api/analytics/prospect-outcomes?days=`（routes-prospecting.ts，analytics:view，route-kit 风格）
- G3 Web：获客分析页（/analytics/lead）新增「评分→赢单回流」区块：等级表 + 画像表 + 快照覆盖率提示（无快照数据时如实显示引导文案）。
- G4 聚合纯查询，不改任何写入路径。

## 2. 非目标

- 不做评分权重自动调整（数据量足够后另行批次）；不做按 matchedKeywords/buyingStage 的细分（下一批）。

## 3. 验收

| 场景 | 层级 | 验收 |
|---|---|---|
| 快照口径优先 + 历史行回退 | 集成 | 转化后行值变化不影响分组（用快照），未转化行用当前值 |
| 赢单链路与赢率计算 | 集成 | won 客户计数、wonRate 分母为 converted |
| 组织隔离与 days 过滤 | 集成 | 他组织不可见；窗口外不计 |
| UI 区块 | web | 表格渲染 + 无数据引导 |
