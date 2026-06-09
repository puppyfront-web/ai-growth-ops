# Research MVP Sync Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local MVP research flow where a user can create a research task, run it synchronously from the web UI, inspect posts/comments/insights/opportunities on the task detail page, and create content from an opportunity without starting worker or research-runner services.

**Architecture:** Add an API-local synchronous research execution service that reuses the sandbox provider and insight generation logic directly inside the API process, then wire the web research pages to that new response model. Verify the end-to-end flow with focused integration and Playwright coverage that only depends on the API and web servers already started by the existing Playwright config.

**Tech Stack:** Node HTTP API, Prisma, Next.js App Router, TanStack Query, Vitest, Playwright

---

### Task 1: Add a failing integration test for synchronous research execution

**Files:**

- Modify: `tests/integration/api/research.test.ts`
- Test: `tests/integration/api/research.test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions that `POST /api/research-tasks/:id/run` returns a payload with `task`, `posts`, `comments`, `insights`, and `opportunities`, and that the task status is `INSIGHT_GENERATED`.

```ts
it('POST /api/research-tasks/:id/run executes synchronously and returns results', async () => {
  const { body: created } = await post('/api/research-tasks', {
    type: 'keyword_search',
    platforms: ['xiaohongshu'],
    keywords: ['AI获客']
  });

  const { status, body } = await post(`/api/research-tasks/${created.id}/run`);
  expect(status).toBe(200);
  expect(body.task.status).toBe('INSIGHT_GENERATED');
  expect(body.posts.length).toBeGreaterThan(0);
  expect(body.comments.length).toBeGreaterThan(0);
  expect(body.insights.length).toBeGreaterThan(0);
  expect(body.opportunities.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/api/research.test.ts`

Expected: FAIL because the current route returns only the updated task with status `RUNNING`.

- [ ] **Step 3: Write minimal implementation**

Do not implement in this task; capture the failing contract first so the backend change has a concrete target.

- [ ] **Step 4: Run test to verify it still fails for the expected reason**

Run: `pnpm vitest run tests/integration/api/research.test.ts -t "executes synchronously and returns results"`

Expected: FAIL with missing `task/posts/comments/insights/opportunities` or wrong status.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/api/research.test.ts
git commit -m "test: add synchronous research run contract"
```

### Task 2: Implement API-local synchronous research execution

**Files:**

- Create: `apps/api/src/research-executor.ts`
- Modify: `apps/api/src/routes.ts`
- Test: `tests/integration/api/research.test.ts`

- [ ] **Step 1: Write the failing test for invalid rerun handling**

Add a test proving a task already in `INSIGHT_GENERATED` cannot be rerun immediately through the route.

```ts
it('POST /api/research-tasks/:id/run rejects already completed task', async () => {
  const { body: created } = await post('/api/research-tasks', {
    type: 'keyword_search',
    platforms: ['xiaohongshu'],
    keywords: ['AI获客']
  });

  await post(`/api/research-tasks/${created.id}/run`);
  const { status } = await post(`/api/research-tasks/${created.id}/run`);
  expect(status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/api/research.test.ts -t "rejects already completed task"`

Expected: FAIL because the route currently only transitions to `RUNNING` and never reaches the completed-state validation path.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/research-executor.ts` with a single exported function that:

```ts
export async function executeResearchTaskSync(
  db: DatabaseClient,
  researchTaskId: string
) {
  // load task
  // validate state
  // set RUNNING
  // collect posts/comments from sandbox provider
  // clear prior insights/opportunities
  // store posts/comments
  // generate insights/opportunities
  // reload task with relations
  // set INSIGHT_GENERATED and return snapshot
}
```

Update `routes.ts` so `POST /api/research-tasks/:id/run` calls the new executor and returns:

```ts
sendJson(res, 200, {
  task: result.task,
  posts: result.posts,
  comments: result.comments,
  insights: result.insights,
  opportunities: result.opportunities
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/integration/api/research.test.ts`

Expected: PASS for the new synchronous run assertions and the invalid rerun assertion.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/research-executor.ts apps/api/src/routes.ts tests/integration/api/research.test.ts
git commit -m "feat: add synchronous research execution in api"
```

### Task 3: Render insights and opportunities on the task detail page

**Files:**

- Modify: `apps/web/src/app/research/tasks/[id]/page.tsx`
- Modify: `apps/web/src/lib/api/research.ts`
- Modify: `apps/web/src/types/research.ts`
- Test: `tests/e2e/research-mvp.e2e.test.ts`

- [ ] **Step 1: Write the failing e2e expectation**

Create a Playwright test that logs in, creates a task, runs it, clicks the `AI 洞察` tab, and expects to see an insight title and an opportunity action button.

```ts
await page.getByRole('button', { name: '运行任务' }).click();
await page.getByRole('button', { name: 'AI 洞察' }).click();
await expect(page.getByText('热门内容主题分析')).toBeVisible();
await expect(page.getByRole('button', { name: '生成内容' })).toBeVisible();
```

- [ ] **Step 2: Run e2e to verify it fails**

Run: `pnpm playwright test tests/e2e/research-mvp.e2e.test.ts`

Expected: FAIL because the current insights tab only shows placeholder copy.

- [ ] **Step 3: Write minimal implementation**

Update the task detail page to:

- consume `task.insights` and `task.opportunities`
- invalidate the detail query after run success
- render an insight list in the `AI 洞察` tab
- render opportunity cards with a real “生成内容” action
- surface mutation success state and link to `/content`

If needed, update the `runResearchTask` return type in `apps/web/src/lib/api/research.ts` and add a typed response object in `apps/web/src/types/research.ts`.

- [ ] **Step 4: Run e2e to verify it passes**

Run: `pnpm playwright test tests/e2e/research-mvp.e2e.test.ts`

Expected: PASS through the task detail insight rendering steps.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/research/tasks/[id]/page.tsx apps/web/src/lib/api/research.ts apps/web/src/types/research.ts tests/e2e/research-mvp.e2e.test.ts
git commit -m "feat: show research insights and opportunities in detail view"
```

### Task 4: Tighten create-and-run flow from the web entry points

**Files:**

- Modify: `apps/web/src/app/research/new/page.tsx`
- Modify: `apps/web/src/app/research/page.tsx`
- Test: `tests/e2e/research-mvp.e2e.test.ts`

- [ ] **Step 1: Write the failing e2e expectation for navigation**

Extend the Playwright test to assert that creating a research task lands on the task detail page and that the list page run button can also trigger execution.

```ts
await page.getByRole('button', { name: '创建任务' }).click();
await expect(page).toHaveURL(/\/research\/tasks\//);
```

- [ ] **Step 2: Run e2e to verify it fails**

Run: `pnpm playwright test tests/e2e/research-mvp.e2e.test.ts`

Expected: FAIL because the current create flow redirects to `/research`.

- [ ] **Step 3: Write minimal implementation**

Update:

- `apps/web/src/app/research/new/page.tsx` to push to `/research/tasks/${created.id}`
- `apps/web/src/app/research/page.tsx` to wire the list-page run button to `runResearchTask` and invalidate the list query

- [ ] **Step 4: Run e2e to verify it passes**

Run: `pnpm playwright test tests/e2e/research-mvp.e2e.test.ts`

Expected: PASS for create-to-detail navigation and list-page run behavior if covered.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/research/new/page.tsx apps/web/src/app/research/page.tsx tests/e2e/research-mvp.e2e.test.ts
git commit -m "feat: streamline research create and run flow"
```

### Task 5: Wire opportunity content creation into the MVP flow

**Files:**

- Modify: `apps/web/src/app/research/tasks/[id]/page.tsx`
- Modify: `apps/web/src/app/research/opportunities/page.tsx`
- Test: `tests/integration/api/research.test.ts`
- Test: `tests/e2e/research-mvp.e2e.test.ts`

- [ ] **Step 1: Write the failing tests**

Add:

- an integration assertion that `create-content` returns `contentItemId`
- an e2e assertion that clicking “生成内容” shows success feedback

```ts
await page.getByRole('button', { name: '生成内容' }).click();
await expect(page.getByText('已生成内容')).toBeVisible();
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

- `pnpm vitest run tests/integration/api/research.test.ts -t "create content"`
- `pnpm playwright test tests/e2e/research-mvp.e2e.test.ts`

Expected: FAIL because the current detail page has no real opportunity action and the opportunities page only links to `/content/new`.

- [ ] **Step 3: Write minimal implementation**

Use `createContentFromOpportunity(opportunityId)` in both the task detail page and the opportunities page where appropriate, and show a concise success state such as:

```tsx
<p className="text-sm text-emerald-700">已生成内容，前往内容列表查看</p>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

- `pnpm vitest run tests/integration/api/research.test.ts`
- `pnpm playwright test tests/e2e/research-mvp.e2e.test.ts`

Expected: PASS for content creation from an opportunity.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/research/tasks/[id]/page.tsx apps/web/src/app/research/opportunities/page.tsx tests/integration/api/research.test.ts tests/e2e/research-mvp.e2e.test.ts
git commit -m "feat: create content from research opportunities"
```

### Task 6: Final verification

**Files:**

- No file changes expected

- [ ] **Step 1: Run the focused integration suite**

Run: `pnpm vitest run tests/integration/api/research.test.ts`

Expected: PASS

- [ ] **Step 2: Run the research MVP e2e**

Run: `pnpm playwright test tests/e2e/research-mvp.e2e.test.ts`

Expected: PASS

- [ ] **Step 3: Run the existing dashboard smoke test to check collateral damage**

Run: `pnpm playwright test tests/e2e/customer-workbench.e2e.test.ts`

Expected: PASS

- [ ] **Step 4: Review the diff**

Run: `git diff --stat`

Expected: changes limited to API sync research execution, research UI pages, types/api helpers, and research-focused tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src apps/web/src tests docs/superpowers/specs/2026-05-28-research-mvp-sync-run-design.md docs/superpowers/plans/2026-05-28-research-mvp-sync-run.md
git commit -m "feat: deliver synchronous research mvp flow"
```
