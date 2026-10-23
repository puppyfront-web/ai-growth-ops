# 获客结果列表分页筛选 Plan

按 TDD 顺序拆分。依赖：无迁移、无新依赖；任务 3、4 依赖任务 2 的接口契约。

## 任务 1：Spec ✅

`spec/21_获客结果列表分页筛选_SPEC.md`（本文件为其计划）。

## 任务 2：集成测试（Red）

文件：`tests/integration/api/prospecting-candidates-list.test.ts`（新建）

- 参照 `tests/integration/api/prospecting-intent.test.ts` 的启动/登录/组织夹具。
- 种子：1 任务 + 6 条 candidate（分数梯度 90/80/70/60/50/40、等级 A-D、部分 `customerId` 非空、昵称/评论内容可搜索）。
- 断言：
  - `GET /api/prospecting/tasks/:id/candidates` 默认排序 `relevanceScore desc, id asc`，`page/pageSize/total/totalPages` 正确；
  - `minScore`、`leadLevel`、`converted=yes|no`、`q`（昵称命中、评论内容命中）及组合过滤；
  - `focusId`：命中的低分行返回其所在页并带 `focusResolved`；不存在的 id 忽略；
  - `convertedCount` 为任务级、不受筛选影响；
  - `GET /api/prospecting/tasks/:id` 响应不再含 `candidates` 字段；
  - 未登录 401；无 `research:view` 权限 403；跨组织任务 404。
- 验收命令：`pnpm test:integration -- tests/integration/api/prospecting-candidates-list.test.ts`（预期先红）。

## 任务 3：后端实现（Green）

- `apps/api/src/schemas/prospecting.ts`：新增 query schema（`prospectingCandidateQuerySchema`：`minScore`/`leadLevel`/`converted`/`q`/`focusId`）。
- `apps/api/src/routes-prospecting.ts`：
  - 新增 `GET /api/prospecting/tasks/:id/candidates`：`parsePagination` + 筛选 where + `orderBy [{relevanceScore:'desc'},{id:'asc'}]` + count + `convertedCount`（任务级）+ focusId 排名定位；
  - `GET /api/prospecting/tasks/:id` 移除 `include.candidates` 与 `minScore`。
- 验收命令：同任务 2（转绿）。

## 任务 4：Web 单测（Red）

- `tests/web/unit/prospect-filter-bar.test.tsx`（新建）：渲染 `ProspectFilterBar`，输入关键词/相关度、选择等级与转化状态触发 `onChange`；有激活筛选时显示「重置筛选」，点击后清空并回调。
- `tests/web/unit/prospect-user-card.test.tsx`（新建）：`evidence` 4 条时默认渲染 2 条 + 「展开其余 2 条评论」，点击展开全部、可收起；未转化显示「转客户」并回调；`customerId` 存在显示「已转客户」链接。
- 验收命令：`pnpm test:web -- tests/web/unit/prospect-filter-bar.test.tsx tests/web/unit/prospect-user-card.test.tsx`（预期先红）。

## 任务 5：前端实现（Green）

- `apps/web/src/lib/api/prospecting.ts`：`ProspectCandidatePage` 类型 + `listProspectCandidates(taskId, params)`；`ProspectingTask` 去掉 `candidates` 字段。
- `apps/web/src/components/prospecting/ProspectFilterBar.tsx`（新建）：筛选栏（含重置）。
- `apps/web/src/components/prospecting/ProspectUserCard.tsx`（新建）：瘦身卡片（评论折叠、divide-y、p-3），props：candidate、task 策略映射、enrich/convert 回调与状态。`ProfileSummary`/`candidateComments`/`ConvertedBadge` 随迁或复用。
- `apps/web/src/app/(dashboard)/prospecting/[id]/page.tsx`：
  - 移除 `task.candidates` 依赖与本地过滤；新增 filters/page/pageSize state（筛选变更重置页码，参照 customers 页）；
  - candidates useQuery + 轮询规则；`convertedCount`、`runLabel`（total>0）改用列表查询结果；
  - 接入 `ProspectFilterBar`、`DataTablePagination`、`EmptyState`/`ErrorState`/`LoadingState`；
  - 深链：mount 读 hash → `focusId` → 数据到位后 `scrollIntoView`；
  - 评论列表 tab 行内 `line-clamp-2`。
- 验收命令：同任务 4（转绿）。

## 任务 6：回归与验证

- `pnpm test:integration -- tests/integration/api/prospecting-intent.test.ts tests/integration/customer-acquisition.integration.test.ts tests/integration/api/prospecting-candidates-list.test.ts`
- `pnpm test:web -- tests/web/unit/prospect-filter-bar.test.tsx tests/web/unit/prospect-user-card.test.tsx`
- `pnpm typecheck && pnpm lint`
- e2e `tests/e2e/flow-deal-close-loop.e2e.test.ts` 种子仅 1 条潜客必在第 1 页，预期不受影响；如本地环境可跑则验证。

## 任务 7：交付报告

按 AGENTS.md 第 12 节输出改动、证据、未完成项与风险。
