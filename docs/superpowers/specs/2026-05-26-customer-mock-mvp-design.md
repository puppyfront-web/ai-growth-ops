# Customer Mock MVP Design

## Goal

Deliver a customer-verifiable local MVP that covers M2-M7 with deterministic mock providers: content planning, AI generation, six-platform variants, twelve publish jobs, interaction-to-lead conversion, research insights, and a dashboard/report view.

## Scope

The MVP is intentionally mock-first. It does not log in to real social platforms or call real LLMs. Instead, it proves the product workflow, data model, UI, API contracts, repository behavior, and E2E path so customers can validate the operating model before external Provider work begins.

## Architecture

- `apps/api` owns the MVP application service and an HTTP server built on Node's standard library.
- `apps/web` owns a static, customer-facing workbench HTML page served by the API.
- `packages/database` remains the Prisma boundary.
- Mock AI, publish, research, and lead sink behavior is deterministic and writes to Prisma tables.

## Customer Workflow

1. Open the Web workbench.
2. Review platform account readiness for six platforms.
3. Create or reset the demo workflow.
4. Generate one project, two source content items, six text/image variants, six video variants, and twelve publish jobs.
5. Execute mock publishing so all jobs become `PUBLISHED`.
6. Sync mock interactions and convert a qualified lead.
7. Run research and AI review to produce insights, opportunities, skill runs, provider logs, and a dashboard summary.

## API Surface

- `GET /health`
- `GET /api/dashboard`
- `POST /api/demo/reset`
- `POST /api/demo/run`
- `POST /api/publish/execute`
- `POST /api/interactions/sync`
- `POST /api/research/run`
- `GET /`

## Acceptance Criteria

- The full demo flow creates 6 platform accounts, 12 variants, 12 publish jobs, 12 successful provider logs, at least 1 interaction, at least 1 qualified lead, at least 1 research insight, and dashboard metrics.
- The Web workbench can run the flow from a browser with visible customer-readable status.
- Unit/integration tests cover the service and API contracts.
- E2E testing opens the Web workbench and verifies the demo flow through browser actions.
- Existing commands continue to pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`, `docker compose config --quiet`.
