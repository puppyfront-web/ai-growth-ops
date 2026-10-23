# 获客潜客列表倒序与同账号合并 Plan

对应 SPEC：`spec/27_获客潜客列表倒序与同账号合并_SPEC.md`。

## 任务 1：Red — shared 单测

`tests/unit/shared/prospect-merge.test.ts`：
- `secUidFromHomepage`：secUid 形态返回段值；纯数字段返回 null；空/undefined/null；带 `?mod` 查询串；多级路径取最后段。
- `aggregateProspectComments`：同一视频下，结构化评论（externalUserId=数字、userHomepage=secUid 主页）与 DOM 评论（externalUserId=secUid、同主页）聚合为**一条** prospect，`userKey` 为 secUid，evidence 去重（相同内容不重复）。

验收：红。

## 任务 2：Green — shared 实现

- `packages/shared/src/prospect-aggregate.ts`：新增 `secUidFromHomepage` 导出；评论路径 userKey 改为 `secUid ?? externalUserId ?? userNickname`；`index.ts` 无需改（已有 `export *`）。
- 既有聚合单测回归。

## 任务 3：Red — 合并函数集成测试

`tests/integration/prospect-merge.test.ts`（直接调用 database 包函数，参照既有集成测试建库）：
- 同任务两行：行A（key=数字、无 customerId、evidence 1 条、score 70）、行B（key=secUid、customerId=c1、evidence 2 条、score 90，主页同 secUid）→ 合并后一行：evidence 并集、commentCount 重算、评分取 90 行、customerId=c1、物理删除另一行。
- 幂等：二次执行无变化。
- 不同主页/无主页分组不受影响。

## 任务 4：Green — 合并函数 + 落库接线

- `packages/database/src/prospecting.ts`：
  - `mergeDuplicateProspectCandidates(db, taskId)`（事务内合并，规则见 SPEC 4.3）并从 index 导出。
  - `persistProspects` 尾部调用合并。
  - existing 行索引增加 `bySecUid`，查找顺序 userKey → secUid。
  - 30 天抑制数据源（`filterPreviouslySeenProspects` 上游查询）同时收集 secUid。
- 存量回填脚本执行：对现有 4 个任务跑合并，记录行数变化。

## 任务 5：Red+Green — 排序 API

- `apps/api/src/schemas/prospecting.ts`：`prospectCandidateQuerySchema` 加 `sort: z.enum(['relevance','latest']).default('relevance')`。
- `apps/api/src/routes-prospecting.ts`：orderBy 与 focusId 排名按 sort 分支。
- `tests/integration/api/prospecting-candidates-sort.test.ts`：`latest` 降序、默认现状、`sort=xxx` 400、focusId 在 latest 下定位。

## 任务 6：Red+Green — 前端排序切换

- `apps/web/src/lib/api/prospecting.ts`：候选列表函数加 `sort` 参数。
- `ProspectFilterBar.tsx`：排序下拉（相关度优先/最新优先）。
- `prospecting/[id]/page.tsx`：sort state 接入 query。
- 扩展 `tests/web/unit/prospect-filter-bar.test.tsx`：下拉渲染与 onChange。

## 任务 7：Verify + Report

- `pnpm typecheck`、`pnpm lint`；shared 单测、相关集成与 Web 单测；既有 prospecting 测试回归（含 spec/21 的分页用例）。
- 存量回填结果（合并前后行数）写入交付说明。

## 顺序依赖

1→2→3→4→5→6→7。任务 5 依赖任务 4 的 schema 无关，可并行但按序执行；任务 6 依赖任务 5 的参数。
