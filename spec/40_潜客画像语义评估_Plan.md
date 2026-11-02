# 40. 潜客画像语义评估 Plan

> 状态：已实施（2026-11-02）
> 关联：[39_SPEC](./39_潜客画像语义评估与诚实降级_SPEC.md)

按先红后绿拆分；每个任务独立可验收。诊断脚本 `scripts/replay-prospect-scoring.ts` 已就位（切片 0 产物）。

## 切片 1：画像语义评估 + 诚实降级

- T1（红）`tests/unit/shared/prospect-scoring.test.ts` 新增：personaTag 三类（peer_vendor/already_adopted/job_seeker）强制 D 且 score ≤ 25；demand_seeker 透传；非法值忽略；与 sellerSignal 共存。
- T2（红）`tests/unit/database/prospect-honest-degradation.test.ts` 新增：语义不可用时规则 A 级降为 C、riskFlags 标记「语义评估未完成」。（纯函数级：抽取降级函数测）
- T3（绿）shared：`PROSPECT_PERSONA_TAGS` 常量、`SemanticScore.personaTag`、`mergeSemanticScore` 硬规则；`downgradeWithoutSemanticScore(ruleScore, reason)` 纯函数。
- T4（绿）skill：SKILL.md 两步判定重写；`output.schema.json` personaTag 必填枚举。
- T5（绿）database：`scoreProspectsSemantically` 返回 `unavailableReason`（覆盖 status=failed 全部原因）；`executeProspectingTask` 接线降级函数 + `metadata.semanticScoring` + 持久化 personaTag。
- T6（绿）迁移：schema.prisma `personaTag String?` + migration SQL + `pnpm db:generate`。
- T7（红→绿）integration `tests/integration/api/prospecting-candidates-persona.test.ts`：personaTag 过滤命中/不命中/非法 400。
- T8（红→绿）web：`prospect-list-row.test.tsx` 画像标签；`prospect-filter-bar.test.tsx` 画像筛选；任务详情 `semanticScoring` 告警条测试。
- 验收命令：`pnpm vitest run tests/unit/shared/prospect-scoring.test.ts tests/unit/database/prospect-honest-degradation.test.ts`、`pnpm test:integration -- tests/integration/api/prospecting-candidates-persona.test.ts`、`pnpm test:web -- tests/web/unit/prospect-list-row.test.tsx tests/web/unit/prospect-filter-bar.test.tsx`。

## 切片 2：计划生成需求侧约束

- T9（红）`tests/unit/database/prospecting-plan.test.ts` 新增：输出矫正层在 offering 为服务类且 `intent.exclusions` 为空时，兜底注入通用排除词（同行/服务商/代理商/培训机构/求职者）。
- T10（绿）`packages/database/src/prospecting-plan.ts`：SYSTEM_PROMPT 需求侧查询约束 + `coerceIntent` 排除词兜底。
- 验收命令：`pnpm vitest run tests/unit/database/prospecting-plan.test.ts`。

## 切片 3：回归与真实验收

- T11 全量 `pnpm typecheck` + `pnpm lint` + `pnpm test`（integration 需 e2e 库）。
- T12 真实回放（依赖组织 LLM 恢复）：`pnpm tsx --env-file=.env scripts/replay-prospect-scoring.ts 3ba8649a… 20`，按 39 号 spec AC-3 验收线记录数据进交付记录。
- T13 交付记录 `docs/delivery/2026-11-02-prospect-persona-scoring.md`。
