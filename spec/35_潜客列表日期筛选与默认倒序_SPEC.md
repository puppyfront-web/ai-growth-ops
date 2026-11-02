# 35. 潜客列表日期筛选与默认倒序 SPEC

> 状态：已实施（2026-11-02）
> 关联：[31_智能获客多账号执行_SPEC](./31_智能获客多账号执行_SPEC.md)（并行）、[33_获客任务绑定账号重新登录_SPEC](./33_获客任务绑定账号重新登录_SPEC.md)
> 背景：用户反馈「账号搜索（潜客列表按抖音号/昵称/评论搜索）加日期分段筛选，列表默认按时间倒序」。

## 1. 背景

获客任务详情页的潜客列表（`GET /api/prospecting/tasks/:id/candidates`）：

1. 无任何日期维度筛选，增量执行多轮后无法只看新增潜客；
2. 默认排序为「相关度优先」（`sort` 默认 `relevance`），用户期望默认看到最新采集；
3. 列表行不展示采集时间，按时间排序后无法对齐感知。

## 2. 目标与非目标

### 2.1 目标

- G1 `sort` 默认值改为 `latest`（采集时间倒序 `createdAt desc, id desc`）；「相关度优先」保留为可选项。
- G2 新增 `dateRange` 分段筛选：`all`（默认）/ `today` / `7d` / `30d`，按 `createdAt >= 边界` 过滤（today=本地当天 0 点，单机部署服务器时区即用户时区；7d/30d=now−N 天）。
- G3 筛选栏新增日期分段按钮组（全部/今天/近7天/近30天），与其他筛选一样进入 URL 同步与重置语义。
- G4 列表行元信息展示 `formatDateTime(createdAt)`。
- G5 focusId 深链定位沿用同一 where（日期范围外的聚焦项不定位，行为一致）。

### 2.2 非目标

- 导出 CSV 不加日期参数（导出现状仅支持 minScore，本就非所见即所得，统一改造另行排期）；
- 不做自定义起止日期区间；
- 不动评论/私信承接页。

## 3. API

`prospectCandidateQuerySchema`：`sort: z.enum(['relevance','latest']).default('latest')`；新增 `dateRange: z.enum(['all','today','7d','30d']).default('all')`。路由 where 增加 `createdAt: { gte }`；orderBy 与 focusId「排在前面」条件共用 `sort` 值的结构不变。

## 4. UI

`ProspectFilterBar`：关键词/最低相关度/意向等级/转化状态之后新增日期分段按钮组；排序下拉首选项与默认值改为「最新优先」。`ProspectListRow` 元信息行追加采集时间。

## 5. 验收标准

| 编号 | 场景 | 层级 | 验收 |
|---|---|---|---|
| A1 | 不带 sort 参数 | 集成 | 默认按 createdAt 倒序 |
| A2 | dateRange=today/7d/30d | 集成 | 分别只含 1 小时前 / ≤7 天 / ≤30 天数据，31 天前数据仅 all 可见 |
| A3 | dateRange 与 q 组合 | 集成 | 两条件交集 |
| A4 | 非法 dateRange | 集成 | 400 |
| A5 | 日期分段交互与默认排序 | Web 单测 | 分段渲染+回调；排序默认「最新优先」 |
| A6 | 行内时间展示 | Web 单测 | 显示 formatDateTime(createdAt) |
