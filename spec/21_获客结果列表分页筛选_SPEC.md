# 获客结果列表分页筛选 SPEC

## 1. 背景

获客任务详情页（`apps/web/src/app/(dashboard)/prospecting/[id]/page.tsx`）当前一次性渲染全部潜客：

- `GET /api/prospecting/tasks/:id` 全量内嵌返回 `candidates`（仅支持 `minScore`），潜客一多响应与页面都臃肿。
- 筛选只有"最低相关度"，且为前端本地过滤；无关键词、意向等级、转化状态筛选。
- 无分页：数百条结果时页面极长、滚动定位困难。

关键数据事实：`ProspectCandidate` 有 `@@unique([prospectingTaskId, userKey])`，**每用户每任务仅一行**，多条评论存于 `evidence` JSON。因此"用户视图"（按用户聚合的卡片）与"评论列表"（扁平表格）实际分页同一批行，可共用一份服务端分页数据。

既有约束：客户详情页存在深链 `/prospecting/{taskId}#candidate-{candidateId}`（`customers/[id]/page.tsx`），分页后必须仍能定位到该潜客所在页。

## 2. 目标

1. 潜客结果服务端分页 + 筛选：关键词（昵称/抖音号/评论内容）、最低相关度、意向等级（A/B/C/D）、转化状态。
2. 任务详情接口不再内嵌全量 candidates，详情响应瘦身。
3. 深链 `#candidate-{id}` 在分页下仍定位到所在页并滚动到该卡片。
4. 用户视图卡片瘦身：评论默认折叠、去除逐条边框、收紧内边距；头像采集/主页链接/转客户等功能不回退。
5. 列表区具备 pending / 错误（可重试）/ 筛选零结果空态。

## 3. 非目标

- 筛选条件不同步到 URL（`#candidate-` 深链除外，沿用现有 hash）。
- 不做自定义排序（固定按相关度降序、id 升序兜底）。
- 不改导出 CSV（继续全量导出，`minScore` 参数维持现状）。
- 不改采集、评分、转客户链路与数据模型（无迁移）。

## 4. API

### 4.1 新增 `GET /api/prospecting/tasks/:id/candidates`

权限：登录 + `research:view`；任务按 `id + organizationId` 查找，不存在或跨组织返回 404。

Query 参数：

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `page` | int ≥1 | 1 | `parsePagination` 解析 |
| `pageSize` | int 1-100 | 20 | 同上 |
| `minScore` | int 0-100 | 0 | `>0` 时 `relevanceScore >= minScore` |
| `leadLevel` | `A\|B\|C\|D` | - | 可选，等值过滤 |
| `converted` | `yes\|no` | - | 可选；`yes` → `customerId != null`，`no` → `customerId == null` |
| `q` | string ≤100 | - | 可选，trim 后 `OR` 匹配 `userNickname`/`externalUserId`/`content` 的 contains |
| `focusId` | uuid | - | 可选，深链定位，见 4.2 |

排序固定 `[{ relevanceScore: 'desc' }, { id: 'asc' }]`。

响应：

```ts
{
  items: ProspectCandidate[];
  total: number;        // 当前筛选条件下的总数
  page: number;
  pageSize: number;
  totalPages: number;
  convertedCount: number; // 任务级（不带筛选）已转客户数，供顶部统计卡
  focusResolved?: string; // 当 focusId 命中时返回该 id，便于前端确认
}
```

### 4.2 focusId 深链定位

带 `focusId` 时：先按任务+组织查该行；行存在且通过当前筛选时，用一次 count 计算其排名：

```
rank = count(where: 筛选条件 AND (relevanceScore > row.relevanceScore
              OR (relevanceScore = row.relevanceScore AND id < row.id)))
page = floor(rank / pageSize) + 1
```

按该页返回数据并带 `focusResolved`。行不存在、跨组织或被筛掉时忽略 focus，按请求页返回（不报错——深链来自历史链接，筛选上下文可能已变化）。

### 4.3 瘦身 `GET /api/prospecting/tasks/:id`

去掉 `include.candidates` 与 `minScore` 参数。该接口仅详情页使用；详情页改用 4.1 拉列表。`GET /api/prospecting/tasks/:id/export.csv` 不变。

## 5. UI 规格

### 5.1 筛选栏（新增 `ProspectFilterBar` 组件）

关键词输入框（变更即重置到第 1 页）｜最低相关度数字输入｜意向等级下拉（全部/高意向 A/中意向 B/低意向 C/无效 D）｜转化状态下拉（全部/未转化/已转客户）｜「重置筛选」按钮（仅在有激活筛选时显示）。保留「用户视图/评论列表」切换与计数文案（计数改用服务端 `total`）。

### 5.2 列表与分页

- 两个 tab 共用同一份分页查询：`['prospecting','task',id,'candidates',{...filters,page,pageSize}]`。
- 底部复用 `DataTablePagination`（首页/上页/下页/末页 + 每页 10/20/50/100）。
- 轮询：任务 `running` 时详情与列表均 3s；当前页任一条 `metadata.enrichStatus` 为 `queued/running` 时列表 3s。
- 状态：列表首次加载 `LoadingState`；失败 `ErrorState`（可重试）；筛选零结果 `EmptyState`（提示调整筛选或重置）。
- 深链：挂载时读 `location.hash`，匹配 `#candidate-{id}` 则首次请求带 `focusId`，数据到位后 `scrollIntoView`。

### 5.3 用户卡片瘦身（新增 `ProspectUserCard` 组件）

- 评论默认展开前 2 条，其余折叠为「展开其余 N 条评论」，可收起。
- 评论列表去掉逐条边框盒，改为单一容器 `divide-y` 分隔；保留首条「优先跟进」徽标与点赞数。
- 卡片内边距收紧（`p-4 → p-3` 等）；`ProfileSummary`（两行）保持。
- 头像点击采集、主页链接、转客户按钮/已转客户徽标、采集状态提示全部保留。

### 5.4 评论列表 tab

同一份分页数据渲染表格；评论与来源视频列加 `line-clamp-2` 截断，防止单行撑高。

## 6. 验收标准

1. 潜客 ≥ 25 条的任务：默认每页 20 条，可翻页、可改每页条数，排序稳定不串页。
2. 各筛选参数单独与组合使用均生效，`total` 随筛选变化；筛选变更自动回到第 1 页。
3. 任务级「已转客户」统计在有筛选时仍显示任务总数。
4. 客户详情页「来源潜客」深链在分页下跳到对应页并滚动定位。
5. 未登录 401、无权限 403、跨组织任务 404。
6. `pnpm typecheck`、`pnpm lint`、新增测试与受影响回归测试通过。

## 7. 测试矩阵

| 层 | 文件 | 覆盖 |
| --- | --- | --- |
| 集成 | `tests/integration/api/prospecting-candidates-list.test.ts` | 分页/排序跨页、minScore/leadLevel/converted/q 及组合、focusId 定位与忽略路径、401/403/404 跨组织 |
| Web 单测 | `tests/web/unit/prospect-filter-bar.test.tsx` | 输入/下拉触发回调、重置清空并回调 |
| Web 单测 | `tests/web/unit/prospect-user-card.test.tsx` | 默认 2 条评论、展开/收起、转客户回调、已转化徽标 |
| 回归 | `tests/integration/api/prospecting-intent.test.ts`、`tests/integration/customer-acquisition.integration.test.ts` | 既有链路不受影响 |
