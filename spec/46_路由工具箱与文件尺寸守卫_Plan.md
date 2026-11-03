# 46. 路由工具箱与文件尺寸守卫 Plan

> 关联：[45_SPEC](./45_路由工具箱与文件尺寸守卫_SPEC.md) | 方式：SDD + TDD | 状态：已实施

| 切片 | 测试先行 | 产出 |
|---|---|---|
| S1 尺寸守卫 | `tests/unit/harness/file-size-guard.test.ts`（先红：当前无守卫，规则已可断言冻结清单） | 守卫测试 |
| S2 route-kit | 全量集成套件回归（迁移即验证） | `apps/api/src/route-kit.ts` |
| S3 迁移 15 个 routes-* | S1/S2 | 各文件删本地拷贝改导入 |
| S4 defineRoute 示范 | notifications/follow-ups 既有路径 | 两文件处理器工厂化 |

冻结清单（2026-11-03 基线）：routes.ts 7044、assist-routes.ts 3064、interaction-pipeline.ts 900（并行批次实时在途，临时上限；完成后应拆分回落）、database/prospecting.ts 1913、prospecting/[id]/page.tsx 1120、routes-customers.ts 1064、routes-prospecting.ts 1062（51 号 spec +7）、database/outreach.ts 944（同日因免打扰时段组织配置 +25 行调整）、integrations/platforms/page.tsx 870。

验收：`corepack pnpm test:unit`（含守卫）+ 全量 `corepack pnpm test:integration` + `corepack pnpm typecheck && corepack pnpm lint`。
