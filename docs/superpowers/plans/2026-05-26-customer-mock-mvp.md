# Customer Mock MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a customer-verifiable local MVP for M2-M7 using deterministic mock providers.

**Architecture:** Keep the MVP workflow in `apps/api` as a service over Prisma, serve a static customer workbench from `apps/web`, and validate through integration plus browser E2E tests. Use mock providers for publishing, AI, lead sinks, and research so the workflow is reliable without external credentials.

**Tech Stack:** TypeScript, Node HTTP, Prisma/PostgreSQL, Vitest, Playwright, pnpm workspace

---

### Task 1: Prove the demo service contract

**Files:**

- Create: `tests/integration/mvp/customer-flow.integration.test.ts`
- Create: `apps/api/src/mvp-service.ts`

- [ ] Write a failing integration test that calls `runCustomerDemoFlow()` and expects six accounts, twelve variants, twelve published jobs, one lead, and research insights.
- [ ] Run the test and verify it fails because the service does not exist.
- [ ] Implement the service over Prisma with deterministic mock data.
- [ ] Re-run the integration test and keep it green.

### Task 2: Add HTTP API and static Web workbench

**Files:**

- Modify: `apps/api/src/index.ts`
- Create: `apps/api/src/server.ts`
- Modify: `apps/web/src/index.ts`
- Create: `apps/web/src/workbench.ts`
- Create: `tests/integration/mvp/api.integration.test.ts`

- [ ] Write a failing API integration test for health, dashboard, reset, run, publish, interaction sync, and research endpoints.
- [ ] Implement the Node HTTP server and JSON routing.
- [ ] Implement a static workbench page with controls and dashboard rendering.
- [ ] Re-run API integration tests.

### Task 3: Add browser E2E coverage

**Files:**

- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `tests/e2e/customer-workbench.e2e.test.ts`

- [ ] Add Playwright as the E2E runner.
- [ ] Write a browser test that opens `/`, runs the demo, and verifies dashboard text.
- [ ] Run the E2E test against the local API server.

### Task 4: Final verification

**Files:**

- Verify all files above.

- [ ] Run `pnpm db:generate`.
- [ ] Run `pnpm db:migrate`.
- [ ] Run `pnpm db:seed`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm e2e`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm format:check`.
- [ ] Run `docker compose config --quiet`.
