# 36. 潜客列表日期筛选与默认倒序 Plan

> 关联：[35_潜客列表日期筛选与默认倒序_SPEC](./35_潜客列表日期筛选与默认倒序_SPEC.md)
> 方式：SDD + TDD
> 状态：已实施

## 0. 总览（测试先行）

| 切片 | 任务 | 测试先行 | 产出 | 依赖 |
|---|---|---|---|---|
| S1 | 默认排序 + dateRange 后端 | 扩展 `tests/integration/api/prospecting-candidates-sort.test.ts` | — | — |
| S2 | 筛选栏日期分段 + 行时间 | 扩展 `tests/web/unit/prospect-filter-bar.test.tsx`、`prospect-list-row.test.tsx` | — | — |
| S3 | 后端实现 | S1 | `apps/api/src/schemas/prospecting.ts`、`apps/api/src/routes-prospecting.ts` | S1 |
| S4 | 前端实现 | S2 | `lib/api/prospecting.ts`、`ProspectFilterBar.tsx`、`prospecting/[id]/page.tsx`、`ProspectListRow.tsx` | S3 |

## 1. S1 集成测试（Red）

在现有 sort 测试文件追加：默认倒序、dateRange 三档（造 1 小时前/8 天前/31 天前显式 createdAt）、组合 q、非法值 400。

## 2. S3 后端（Green）

schema 默认值 `latest` + `dateRange` 枚举；路由解构同步、where 增加 createdAt 边界；边界计算放纯函数（便于复用）。

## 3. S4 前端（Green）

`ProspectCandidateFilters` 加 `dateRange: '' | 'today' | '7d' | '30d'`；FilterBar 分段按钮组（样式参照 ChartContainer）；页面 URL 初始化/写回；行组件补时间。

## 4. 验收命令

```bash
corepack pnpm vitest run tests/integration/api/prospecting-candidates-sort.test.ts
corepack pnpm vitest run --config vitest.web.config.ts tests/web/unit/prospect-filter-bar.test.tsx tests/web/unit/prospect-list-row.test.tsx
corepack pnpm typecheck && corepack pnpm lint
```
