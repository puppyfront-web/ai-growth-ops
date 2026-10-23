# 获客潜客列表详情双栏 Plan

依赖：spec/21 的后端接口不变；本计划只动前端。按 TDD 顺序执行。

## 任务 1：Spec ✅

`spec/23_获客潜客列表详情双栏_SPEC.md`。

## 任务 2：Web 单测（Red）

- 新建 `tests/web/unit/prospect-list-row.test.tsx`：点击行触发 `onSelect`；选中态带高亮类；评论摘要渲染；`customerId` 存在时显示「已转客户」徽标；DOM id 为 `candidate-{id}`。
- 新建 `tests/web/unit/prospect-detail-panel.test.tsx`（取代 `prospect-user-card.test.tsx`）：全量评论渲染（4 条 evidence 全部出现，无折叠按钮）；头像按钮触发 `onEnrich`；未转化点击「转客户」回调；`customerId` 存在显示「已转客户」链接。
- 删除 `tests/web/unit/prospect-user-card.test.tsx`（折叠行为随卡片形态一并移除）。
- 验收：`pnpm test:web`（新用例先红）。

## 任务 3：组件实现（Green）

- 新建 `apps/web/src/components/prospecting/ProspectListRow.tsx`。
- 新建 `apps/web/src/components/prospecting/ProspectDetailPanel.tsx`：由 `ProspectUserCard` 演化——去掉评论折叠，保留 `ProfileSummary`/`candidateComments`/`ConvertedBadge`/`prospectLevelLabels` 导出。
- 删除 `apps/web/src/components/prospecting/ProspectUserCard.tsx`。
- 验收：任务 2 用例转绿。

## 任务 4：页面接入双栏

`apps/web/src/app/(dashboard)/prospecting/[id]/page.tsx`：

- 移除 `viewMode`/双 tab 与旧卡片渲染；引入 `selectedId` state。
- 双栏 grid：左 `ProspectListRow` 列表 + `DataTablePagination`；右 `ProspectDetailPanel`（`lg:sticky` 内部滚动）；`<lg` 用覆盖层展示详情（Esc 关闭）。
- 选中逻辑：`selectedId` 不在当前页 → 自动选首位；深链 focusId 到位后选中并滚动该行。
- URL 同步：`useSearchParams` 初始化 filters/page/pageSize；变更 `router.replace`（`q` 防抖 300ms、`scroll: false`）。
- 验收：`pnpm typecheck && pnpm lint && pnpm test:web`。

## 任务 5：回归与验证

- `pnpm test:web`、`pnpm test:unit` 全量。
- `pnpm test:e2e -- tests/e2e/flow-deal-close-loop.e2e.test.ts`：验证自动选中使转客户按钮直接可用。
- `pnpm --filter @ai-growth-ops/web build`：确认 `useSearchParams` 不引发预渲染错误。

## 任务 6：交付报告

按 AGENTS.md §12 输出证据、未完成项与风险。
