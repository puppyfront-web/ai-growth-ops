# 41. 评分快照埋点（评分→赢单回流数据地基） SPEC

> 状态：已实施（2026-11-03）
> 关联：[39_潜客画像语义评估](./39_潜客画像语义评估与诚实降级_SPEC.md)、founding engineer 评审 P0
> 背景：系统已完整记录 潜客(评分)→转客户→商机→赢单 链路，但评分的**分量**（规则分/LLM 原始分/降级标记/语义维度）在合并后被丢弃，转化时刻的评分现场也未被冻结——无法离线回答"哪类信号真的预示赢单"。本 spec 只做埋点（种子），分析消费后续批次。

## 1. 目标与非目标

### 目标

- G1 `SCORING_VERSION` 常量（shared）：评分逻辑任何变更必须递增（1=规则+语义合并；2=39 号画像两步判定）。
- G2 候选落库时在 `metadata.scoring` 写入评分快照：`{ version, ruleScore, semanticScore(null=未跑), personaTag, degraded, reason?, dimensions?{audienceFit,needStrength,buyingIntent,evidenceQuality} }`。
- G3 `convertProspectToCustomer` 冻结 `metadata.conversionSnapshot`（首次转化时刻的现场）：`{ at, relevanceScore, leadLevel, personaTag, summary, matchedKeywords, evidenceCount, scoringVersion }`；已有快照不覆盖（幂等）；保留 metadata 其他键。
- G4 合并语义保持：upsert 更新时高分替换连带头换快照，低分保留旧分与旧快照。

### 非目标

- 不做分析查询/UI（飞轮收割另行排期）；不改评分算法；不回填历史行。

## 2. 验收

| 场景 | 层级 | 验收 |
|---|---|---|
| 新建候选携带 metadata.scoring | 集成 | 字段完整（version/ruleScore/semanticScore/personaTag/degraded） |
| 低分更新保留旧快照 / 高分更新替换 | 集成 | 两分支断言 |
| 转化冻结 conversionSnapshot | 集成 | 快照值=转化时刻行值；其他 metadata 键保留；重复转化抛既有错误且快照不变 |
