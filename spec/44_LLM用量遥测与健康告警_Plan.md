# 44. LLM 用量遥测与健康告警 Plan

> 关联：[43_SPEC](./43_LLM用量遥测与健康告警_SPEC.md) | 方式：SDD + TDD | 状态：已实施

| 切片 | 测试先行 | 产出 |
|---|---|---|
| S1 错误分类 | `tests/unit/shared/llm-telemetry.test.ts` | `packages/shared/src/llm-telemetry.ts` |
| S2 聚合/告警 | `tests/integration/api/llm-usage-analytics.test.ts` | `packages/database/src/llm-telemetry.ts`（recordLlmRun/getLlmUsageSummary/notifyLlmHealthIssue）+ 迁移 |
| S3 评分埋点 | S2 | `packages/database/src/prospecting.ts`（scoreProspectsSemantically 记录 + 即时告警） |
| S4 API | S2 | `apps/api/src/routes-costs.ts` GET /api/analytics/llm-usage |
| S5 UI | 手工+页面既有模式 | `lib/api/efficiency.ts` + efficiency 页「AI 算力用量」区块 |
| S6 每日兜底 | S2（服务函数已测） | worker：队列 `llm.health-check` + scheduler 每日 + handler |

验收：unit + 新集成测试 + `corepack pnpm typecheck && corepack pnpm lint` + prospecting 回归。
