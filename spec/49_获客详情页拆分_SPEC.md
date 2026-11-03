# 49. 获客任务详情页拆分 SPEC

> 状态：已实施（2026-11-03）
> 关联：架构评审阶段 3（页面瘦身）；文件尺寸守卫冻结清单首位（1120 行）
> 背景：`prospecting/[id]/page.tsx` 为全仓最大页面，内联 3 个组件共 ~315 行（ConvertDialog 178 / CaptchaSolveDialog 104 / MobileDetailOverlay 33），违背 CustomerEditor 先例的两种做法并存问题。

## 1. 目标

- G1 三个内联组件抽取到 `apps/web/src/components/prospecting/`（ConvertDialog.tsx / CaptchaSolveDialog.tsx / MobileDetailOverlay.tsx），页面改为导入，行为零变化。
- G2 页面降到 800 行以下并**移出文件守卫冻结清单**（守卫"清单未过期"测试强制）。
- G3 抽出的 ConvertDialog 补关键行为单测（409 重复客户流 → 展示重复列表并要求确认）。

## 2. 非目标

- 不改任何交互逻辑/文案；不拆页面其余部分（后续按需）。

## 3. 验收

| 场景 | 层级 | 验收 |
|---|---|---|
| ConvertDialog 409 流 | web 单测 | mock convert 409+duplicates → 展示重复项与"仍要新建" |
| 页面行为回归 | web | 全量 web 套件通过 |
| 行数达标 | unit | 守卫通过且该文件不在冻结清单 |
