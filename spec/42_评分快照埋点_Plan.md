# 42. 评分快照埋点 Plan

> 关联：[41_评分快照埋点_SPEC](./41_评分快照埋点_SPEC.md)
> 方式：SDD + TDD
> 状态：已实施

| 切片 | 测试先行 | 产出 |
|---|---|---|
| S1 集成测试（upsert 快照/合并语义/转化冻结） | `tests/integration/api/prospecting-scoring-snapshot.test.ts`（新） | — |
| S2 shared 版本常量 | S1 | `packages/shared/src/prospect-scoring.ts` |
| S3 管线埋点 | S1 | `packages/database/src/prospecting.ts`（评分循环组装 telemetry、upsert 写 metadata、convert 冻结快照；导出 upsertProspectCandidate 与 telemetry 类型） |

验收：`corepack pnpm vitest run tests/integration/api/prospecting-scoring-snapshot.test.ts` + `corepack pnpm typecheck && corepack pnpm lint` + prospecting 回归。
