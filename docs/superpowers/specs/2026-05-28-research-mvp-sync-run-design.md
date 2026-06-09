# Research MVP Sync Run Design

**Date:** 2026-05-28

## Goal

交付一个可在当前仓库本地直接跑通的市场调研 MVP，覆盖这条同步产品链路：

`登录 -> 新建调研任务 -> 点击运行 -> 同步得到帖子/评论/洞察/选题机会 -> 从机会生成内容`

这里的“同步”定义为：用户在 Web 页面点击“运行调研”后，不依赖单独启动 worker 消费队列，也不要求额外运行 `research-runner` 服务；API 在当前请求内完成采集、入库、洞察生成和机会生成，并把最终结果直接返回给前端。

## Current Project Analysis

### Current frontend state

- [apps/web/src/app/research/page.tsx](/Users/tutu/apps/ai-growth-ops/apps/web/src/app/research/page.tsx:1) 已有任务列表页，但列表里的“运行”按钮只是静态按钮，没有接 mutation。
- [apps/web/src/app/research/new/page.tsx](/Users/tutu/apps/ai-growth-ops/apps/web/src/app/research/new/page.tsx:1) 已有新建表单，能创建任务，但创建后只返回列表，没有引导用户直接进入结果链路。
- [apps/web/src/app/research/tasks/[id]/page.tsx](/Users/tutu/apps/ai-growth-ops/apps/web/src/app/research/tasks/[id]/page.tsx:1) 已有详情页和“运行任务”按钮；帖子和评论 tab 已接 API；`insights` tab 仍是占位提示，没有展示当前任务的洞察和机会。
- [apps/web/src/app/research/opportunities/page.tsx](/Users/tutu/apps/ai-growth-ops/apps/web/src/app/research/opportunities/page.tsx:1) 已有机会页，但“生成内容”只是跳到 `/content/new`，并没有真正调用 `create-content` 接口。
- [apps/web/src/lib/api/research.ts](/Users/tutu/apps/ai-growth-ops/apps/web/src/lib/api/research.ts:1) 已经有 `runResearchTask`、`listInsights`、`listOpportunities`、`createContentFromOpportunity` 封装，可复用。
- [apps/web/src/lib/api/client.ts](/Users/tutu/apps/ai-growth-ops/apps/web/src/lib/api/client.ts:1) 已经统一处理 Bearer token 和 401 跳转，因此 e2e 必须先登录。

### Current backend state

- `POST /api/research-tasks/:id/run` 在 [apps/api/src/routes.ts](/Users/tutu/apps/ai-growth-ops/apps/api/src/routes.ts:146) 当前只做两件事：
  1. 把任务状态改成 `RUNNING`
  2. 尝试投递 BullMQ 队列
- 真正的采集、入库、洞察生成在 [apps/worker/src/job-handlers/research.run.ts](/Users/tutu/apps/ai-growth-ops/apps/worker/src/job-handlers/research.run.ts:1)。
- worker 的研究执行依赖 `research-runner` HTTP 服务，后者通过 [apps/research-runner/src/executor.ts](/Users/tutu/apps/ai-growth-ops/apps/research-runner/src/executor.ts:1) 调用 sandbox provider。
- 洞察生成逻辑在 worker 和 research-runner 下各有一份，分别位于：
  - [apps/worker/src/insight-generator.ts](/Users/tutu/apps/ai-growth-ops/apps/worker/src/insight-generator.ts:1)
  - [apps/research-runner/src/insight-generator.ts](/Users/tutu/apps/ai-growth-ops/apps/research-runner/src/insight-generator.ts:1)
- 当前 API `run` 路由不适合 MVP 同步体验，因为它的结果取决于额外服务和异步队列，且本仓库 Playwright 配置不会自动启动 worker 或 research-runner。

### Current testing state

- [playwright.config.ts](/Users/tutu/apps/ai-growth-ops/playwright.config.ts:1) 只启动 API 和 Web，不启动 worker / runner。
- [tests/e2e/customer-workbench.e2e.test.ts](/Users/tutu/apps/ai-growth-ops/tests/e2e/customer-workbench.e2e.test.ts:1) 目前只有非常轻的 dashboard smoke test。
- 调研 API 集成测试已经存在，并已针对当前认证模型调整为可用：
  [tests/integration/api/research.test.ts](/Users/tutu/apps/ai-growth-ops/tests/integration/api/research.test.ts:1)

### Main mismatch to resolve

项目现有“研究执行”架构是异步拆分式的，但你确认的 MVP 目标是“用户点击后同步产出结果”。因此本次不应该继续围绕 BullMQ 和 research-runner 做端到端闭环，而应该在保留未来拆分空间的前提下，为 API 增加一条同步执行路径，并让 Web 与 e2e 都基于这条路径工作。

## Chosen Approach

采用“API 内同步执行 Research MVP”的方案。

### Why this approach fits this repository

- 它与当前 Playwright 启动方式兼容。现有 `webServer` 只拉起 API 和 Web，因此我们不需要为了 MVP 改造本地测试编排。
- 它最大化复用现有代码。我们可以保留 sandbox provider、现有数据库模型、现有详情页 tab 结构和现有 `create-content` 接口。
- 它最符合用户体验目标。点击“运行任务”之后，当前页刷新即可看到帖子、评论、洞察和机会，不需要轮询队列，也不需要用户理解后台服务拓扑。

### What we will not do in MVP

- 不接入真实 MediaCrawler。
- 不要求 worker 启动。
- 不要求 `research-runner` 服务参与同步路径。
- 不做分页、筛选、批量运行、取消任务、忽略机会等增强功能。
- 不统一重构所有调研相关类型，只做当前 MVP 所需的最小清理。

## Architecture Design

### 1. Introduce a synchronous research execution service in API

在 API 侧新增一个可复用的同步 service，职责如下：

- 校验任务存在且处于可运行状态
- 将任务状态更新为 `RUNNING`
- 基于任务字段调用 sandbox research provider 采集帖子和评论
- 去重写入 `collected_posts` / `collected_comments`
- 生成 `research_insights` 和 `content_opportunities`
- 将任务状态更新为 `INSIGHT_GENERATED`
- 返回包含任务、帖子、评论、洞察、机会的完整结果

这个 service 要尽量复用已有 worker / runner 逻辑中的稳定部分，但不能再依赖队列和独立服务。MVP 下更推荐“抽出共享同步逻辑”而不是“在 API 内嵌套调用本地 HTTP 接口”。

### 2. Keep the route contract but upgrade the response

`POST /api/research-tasks/:id/run` 继续作为运行入口，但从“只返回状态”升级为“返回同步执行后的完整任务快照”。

预期返回值至少包含：

- 最新 `task`
- `posts`
- `comments`
- `insights`
- `opportunities`

这样前端可以直接用 mutation 结果刷新视图，而不是额外猜测后台是否完成。

### 3. Upgrade the task detail page into the main MVP workspace

任务详情页应成为 MVP 主工作区。

运行后，该页要能直接看到：

- 任务状态和最近运行时间
- 采集到的帖子列表
- 采集到的评论列表
- 当前任务的洞察列表
- 当前任务生成的选题机会
- 从某个机会生成内容后的成功反馈和跳转入口

这比把用户再分流去全局 `insights` 或 `opportunities` 页面更符合“同步闭环”的 MVP 目标。

### 4. Preserve list and global pages as navigation surfaces

- 调研列表页继续展示全部任务，但“运行”按钮应真正触发运行，并在成功后刷新表格。
- 全局洞察页和机会页保留，作为汇总视图；但它们不再是完成主链路的必要条件。

## Detailed Product Flow

### Flow A: Create task

1. 用户登录。
2. 进入 `/research/new`。
3. 选择任务类型、平台、关键词并提交。
4. 创建成功后跳转到 `/research/tasks/[id]`。

理由：
当前产品最缺的是“创建之后马上运行”的连贯性。直接进入详情页最适合承接同步执行。

### Flow B: Run task synchronously

1. 用户在详情页点击“运行任务”。
2. 按钮进入 pending 态。
3. API 同步完成采集与洞察生成。
4. 页面刷新当前任务数据，并自动展示结果区域。

MVP 不需要显示复杂的分阶段进度条；按钮 loading + 成功后结果显现就够了。

### Flow C: Inspect outputs

用户运行成功后可以在同页查看：

- `采集内容` tab：帖子卡片
- `采集评论` tab：评论列表
- `AI 洞察` tab：当前任务的洞察列表与机会列表

这里不应继续只放“前往洞察列表”的占位文案，因为那会打断闭环。

### Flow D: Create content from opportunity

在详情页机会区域，用户点击“生成内容”：

1. 调用 `POST /api/content-opportunities/:id/create-content`
2. 成功后展示成功提示
3. 提供跳转到新内容详情页或内容列表的链接

MVP 不要求在机会页处理“忽略”状态，也不要求内容生成后二次自动开变体。

## Data and Interface Design

### Task detail data needs

当前 `getResearchTask(id)` 已经包含：

- `researchKeywords`
- `targetAccounts`
- `collectedPosts`
- `collectedComments`
- `insights`
- `opportunities`

因此详情页有两个可选实现：

1. 继续分开调用 posts/comments 接口，并直接使用 `task.insights` / `task.opportunities`
2. 简化为主要依赖详情接口，并减少额外请求

推荐第 2 个方向：详情页以 `getResearchTask(id)` 为主数据源，只在需要时保留附加请求。这样同步 run 成功后，只要 invalidate 详情 query，页面就能整体刷新。

### Response shaping

为了避免前端在 mutation 成功后还要多次请求，`run` 路由可返回：

```ts
{
  task: ResearchTaskWithRelations,
  posts: CollectedPost[],
  comments: CollectedComment[],
  insights: ResearchInsight[],
  opportunities: ContentOpportunity[]
}
```

如果实现时觉得保持路由兼容更重要，也可以仍返回 `task`，但前端必须在成功后 invalidate：

- `research-task`
- `research-posts`
- `research-comments`
- `research-insights`
- `content-opportunities`

MVP 推荐直接返回完整 payload，再配合 query invalidation 双保险。

### Deduplication and reruns

同步运行必须处理重复数据问题，否则重复点击会污染样本。

MVP 约束：

- 帖子按 `researchTaskId + externalPostId` 去重
- 评论按 `researchTaskId + externalCommentId` 去重
- 在重新运行前，优先清理该任务历史洞察和机会，再生成新的

对于帖子和评论，MVP 允许保留旧样本并增量去重；对洞察和机会，更适合“删后重建”，避免一条任务累积多轮相同洞察。

## Error Handling

### Backend

- 非法状态运行：返回 400 `INVALID_STATE`
- 任务不存在：返回 404
- provider 失败：任务标记 `FAILED`，记录 `lastError`
- 洞察生成失败：整体任务标记 `FAILED`，不要伪装成功

### Frontend

- 运行失败时，在详情页 `lastError` 区块展示失败原因
- 运行按钮恢复可点击
- 不自动跳走页面

## Testing Design

### API / integration

新增或扩展集成测试，覆盖：

- 创建任务后同步运行成功
- 运行后同一个任务可读取到帖子、评论、洞察、机会
- 从机会生成内容成功
- 非法状态下不能重复运行

这些测试应继续沿用当前认证方式和自建数据方式，而不是依赖过时的 seed 假设。

### E2E

新增一条真正的调研 MVP Playwright 用例：

1. 打开 `/login`
2. 用 `admin@ai-growth-ops.local / changeme123` 登录
3. 进入 `/research/new`
4. 创建关键词调研任务
5. 跳转到详情页并点击“运行任务”
6. 验证详情页出现采集内容、采集评论、洞察、机会
7. 点击“生成内容”
8. 验证内容创建成功信号

由于 Playwright 当前只启动 API 和 Web，这条 e2e 必须完全依赖新的同步 API 路径，不能要求 worker 或 research-runner 常驻。

## Implementation Boundaries

### Files expected to change

- API
  - `apps/api/src/routes.ts`
  - `apps/api/src/...` 新增一个 research sync service
- Shared or API-local research execution helpers
  - 尽量复用 provider / insight 逻辑，必要时抽共享模块
- Web
  - `apps/web/src/app/research/page.tsx`
  - `apps/web/src/app/research/new/page.tsx`
  - `apps/web/src/app/research/tasks/[id]/page.tsx`
  - `apps/web/src/app/research/opportunities/page.tsx`（若保留机会页交互）
  - `apps/web/src/lib/api/research.ts`
  - `apps/web/src/types/research.ts`
- Tests
  - `tests/integration/api/research.test.ts`
  - `tests/e2e/...` 新增 research MVP e2e

### Files explicitly out of scope for MVP

- `apps/worker/**`
- `apps/research-runner/**`
- 真实外部平台 connector
- analytics 聚合逻辑

如果实现中需要少量抽共享代码，可以做，但不要把目标扩展成“统一整个研究架构”。

## Risks and Mitigations

### Risk: duplicate insight logic

当前 worker 和 research-runner 都有 insight generator，MVP 再写第三份会继续扩散。

Mitigation:
优先把当前足够简单的一份洞察生成逻辑抽成 API 可直接调用的共享 helper，至少避免再复制一份。

### Risk: route file is already large

`apps/api/src/routes.ts` 已经很长，如果把同步运行逻辑直接塞进去，会进一步降低可维护性。

Mitigation:
新增 API 本地 service 文件承接同步执行，route 只做参数校验和 response。

### Risk: front-end detail page becoming fragmented

详情页目前按 tab 分散请求，run 成功后的刷新体验可能不一致。

Mitigation:
以任务详情 query 为主刷新源，必要时统一 invalidate 相关 query keys。

## Success Criteria

满足以下条件即视为 MVP 完成：

- 本地只启动 API + Web 就能完成调研主链路
- 用户能在详情页同步看到帖子、评论、洞察和机会
- 用户能从机会真实创建内容
- 至少一条 Playwright e2e 覆盖完整主链路并通过
- API 调研集成测试在当前认证模型下通过
