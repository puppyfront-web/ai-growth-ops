# 50. 获客任务详情页拆分 Plan

> 关联：[49_SPEC](./49_获客任务详情页拆分_SPEC.md) | 方式：SDD + TDD | 状态：已实施

| 切片 | 测试先行 | 产出 |
|---|---|---|
| S1 ConvertDialog 单测（Red） | `tests/web/unit/prospect-convert-dialog.test.tsx` | — |
| S2 抽取三组件 | S1 | `components/prospecting/{ConvertDialog,CaptchaSolveDialog,MobileDetailOverlay}.tsx` |
| S3 页面瘦身 | S2 | page.tsx 删内联、导替换、清未用 import |
| S4 守卫更新 | S3 | 冻结清单移除该文件 |

验收：新单测 + web 全量 + unit 全量（守卫）+ typecheck/lint。
