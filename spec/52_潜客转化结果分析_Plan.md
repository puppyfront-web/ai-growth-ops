# 52. 潜客转化结果分析 Plan

> 关联：[51_SPEC](./51_潜客转化结果分析_SPEC.md) | 方式：SDD + TDD | 状态：已实施

| 切片 | 测试先行 | 产出 |
|---|---|---|
| S1 聚合集成测试（Red） | `tests/integration/api/prospect-outcomes.test.ts` | — |
| S2 聚合服务 | S1 | `packages/database/src/prospect-outcomes.ts` + index 导出 |
| S3 API | S1 | routes-prospecting.ts 新路由 |
| S4 UI | 手工+页面模式 | lib/api/prospecting.ts + analytics/lead 页区块 |

验收：新集成测试 + prospecting 回归 + web 全量 + typecheck/lint + 守卫（routes-prospecting.ts 冻结值需下调更新）。
