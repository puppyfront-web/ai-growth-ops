# AI Growth Ops

M0 project foundation for the AI growth ops system described in `spec/`.

## Scope

This stage creates the workspace skeleton only:

- `apps/web`
- `apps/api`
- `apps/worker`
- `apps/browser-runner`
- `packages/shared`
- `packages/database`
- `packages/connectors`
- `packages/providers`
- `packages/skills`
- `packages/ai`
- `packages/lead-sinks`
- `packages/observability`

Current apps expose typed health-check functions and package placeholders so the workspace can lint, test, and build before deeper business implementation starts.

## Interaction Runtime Notes

Douyin / Xiaohongshu interaction workflows can use real browser-assist execution when both of these are available:

- a valid cookie source
- a running browser-runner service

Recommended startup:

```bash
./node_modules/.bin/tsx apps/browser-runner/src/server.ts
```

Cookie sources:

- `douyin`: `AI_GROWTH_OPS_DOUYIN_COOKIE=<cookie>` or a `social-publish-skills` account cookie file
- `xiaohongshu`: `AI_GROWTH_OPS_XIAOHONGSHU_COOKIE=<cookie>`
- `wechat_channels`: `AI_GROWTH_OPS_WECHAT_CHANNELS_COOKIE=<cookie>` or a `social-publish-skills` account cookie file

## Commands

```bash
pnpm install
pnpm lint
pnpm test
pnpm build
pnpm docker:up
```

## Architecture

The agent runtime is structured as a **runtime-agnostic kernel** plus adapter
layers — see
[`docs/superpowers/specs/2026-06-18-agent-architecture-refactor-design.md`](docs/superpowers/specs/2026-06-18-agent-architecture-refactor-design.md)
for the full design. Six layers, four in the kernel:

**Kernel — `packages/runtime` (no `apps/*` imports, enforced by the architecture guard):**
1. **Orchestrator / Supervisor** — drives the fixed 5-node loop
   (INIT → METRICS → CONTENT → PUBLISH → REVIEW), persists `SupervisorState`.
2. **Agent** — `runDomainAgent` loop with `ConfirmationGate` mediation; agents
   declare `__risk` / `__confidence` per tool call, the gate makes the hard
   allow/escalate decision.
3. **Tool registry** — tool metadata (mutate Read/Write, risk) the gate reads.
4. **Memory** — L0 working memory (per-run) + L1 preferences store.

**Adapters:**
5. **Interface** — Workbench API (`POST/GET /api/agent/runs`) in `apps/api`;
   BullMQ `agent.run` handler in `apps/worker`. (MCP adapter is second-cut.)
6. **Asset** — `apps/browser-runner` (real publish), `packages/skills`,
   `packages/connectors`, `packages/database`.

**First-cut scope:** content → publish loop (`contentAgent`, `publishAgent`,
supervisor), L0 working memory + L1 preferences, `ConfirmationGate` at
`L2_AUTOPILOT_LIGHT` by default, and a dry-run safe mode (blocks all tool calls
at L2/L3, no side effects). MCP adapter, additional domain agents, and memory
L2+ are **second cut**.

This refactor is **increment-only**: legacy `ai-tools`, `growth-ops-agent`, and
`workflow.execute` paths remain in place until a second cut validates their
removal. The architecture guard (`pnpm test:architecture`) warns on legacy
usage and errors on any kernel → `apps/*` dependency.

Operations guide: [`docs/superpowers/runbooks/agent-runtime-runbook.md`](docs/superpowers/runbooks/agent-runtime-runbook.md).

## Infrastructure

`docker-compose.yml` starts local PostgreSQL, Redis, and MinIO services for future stages.
