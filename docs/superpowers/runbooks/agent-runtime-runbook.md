# Agent Runtime Runbook

Operational guide for the unified agent runtime introduced by the
[agent-architecture refactor](../specs/2026-06-18-agent-architecture-refactor-design.md).
Covers local bring-up, triggering runs via the Workbench API, dry-run / autonomy
behavior, and common troubleshooting.

> Scope: **first cut** — content → publish loop (`contentAgent`, `publishAgent`,
> supervisor), L0 working memory + L1 preferences, `ConfirmationGate` at L2 by
> default, dry-run safe mode. MCP adapter, more agents, and memory L2+ are
> **second cut** and not covered here.

---

## 1. What the runtime does (the 5-node loop)

Each `AgentRun` executes a fixed supervisor loop with five nodes, in order:

| Node     | Runs             | Purpose                                             |
|----------|------------------|----------------------------------------------------|
| `INIT`   | `publishAgent`   | Bootstrap / housekeeping for the publish domain     |
| `METRICS`| `contentAgent`   | Pull recent metrics, decide what content to make    |
| `CONTENT`| `contentAgent`   | Draft / select content variants                     |
| `PUBLISH`| `publishAgent`   | Push content to platform(s) via browser-runner       |
| `REVIEW` | `supervisor`     | Summarize the run's node results into a recap        |

The supervisor advances one node per step; the worker persists the full
`SupervisorState` into `AgentRun.output` **after every step**, so the latest
node/result/currentNode is always queryable via `GET /api/agent/runs/:id`.

---

## 2. Startup order

Bring services up in this order:

```bash
# 1. Infrastructure (PostgreSQL + Redis)
pnpm docker:up

# 2. Apply schema (dev only — CI does not run migrations)
pnpm db:push
pnpm db:seed            # only if DB is empty (seeds admin user + org)

# 3. API server  (http://localhost:3000 by default)
pnpm dev                # = pnpm --filter @ai-growth-ops/api dev  (tsx watch src/server.ts)

# 4. Worker (consumes the `agent.run` BullMQ queue)
pnpm --filter @ai-growth-ops/worker dev   # = tsx watch src/index.ts

# 5. Browser-runner (ONLY needed for REAL runs — see §4)
pnpm dev:browser-runner
```

Notes:
- There is **no root `dev:worker` script**. Always start the worker via the
  filter command above.
- `pnpm dev` starts the API only. Web and browser-runner are separate.
- The browser-runner is only contacted when a write tool actually executes.
  Under dry-run (§4) no tool call reaches it.

### 2.1 Environment checklist

| Variable                          | Required | Used by                                         |
|-----------------------------------|----------|-------------------------------------------------|
| `DATABASE_URL`                    | yes      | API + worker (Prisma)                            |
| `REDIS_URL`                       | yes      | BullMQ queue (`agent.run`)                       |
| `OPENAI_API_KEY` **or** `ANTHROPIC_API_KEY` | yes | LLM calls in domain agents              |
| `LLM_PROVIDER`                    | if non-default | Selects provider; see `packages/ai`        |
| `AUTH_SECRET`                     | yes      | JWT signing for the Workbench API                |
| `ADMIN_EMAIL`                     | yes (daily run) | Default admin for the daily scheduled run |
| `ADMIN_PASSWORD`                  | yes (daily run) | (seed-time credential)                     |

The daily scheduler (`apps/worker/src/scheduler.ts`) creates runs as the user
identified by `ADMIN_EMAIL` (default `admin@ai-growth-ops.local`). That user
**and** an organization must exist — the handler throws if either is missing
(seed first).

---

## 3. Triggering a run (Workbench API)

### 3.1 Auth

The API uses JWT bearer auth (same tokens as the rest of the app). Obtain a
token via the existing login flow, then pass it as
`Authorization: Bearer <token>`. Optionally send `X-Organization-Id` to target a
specific org; otherwise the user's default org is used.

### 3.2 `POST /api/agent/runs` — trigger

```bash
curl -X POST http://localhost:3000/api/agent/runs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "autonomyLevel": "L2_AUTOPILOT_LIGHT",
    "dryRun": true
  }'
```

Body:

| Field            | Type      | Default              | Values                                            |
|------------------|-----------|----------------------|---------------------------------------------------|
| `autonomyLevel`  | string?   | `L2_AUTOPILOT_LIGHT` | `L1_COPILOT` \| `L2_AUTOPILOT_LIGHT` \| `L3_FULL_AUTOPILOT` |
| `dryRun`         | boolean?  | `false`              | see §4                                            |

Response: `200 { runId: string, queued: boolean }`.

**Best-effort enqueue.** The `AgentRun` row is always created. `queued:false`
means Redis was unreachable when the request landed — the run is still persisted
with status `pending` and will be picked up by the daily scheduler or a manual
re-trigger (re-POST with the same `runId` semantics, or wait for the scheduler).
This keeps the trigger testable without Redis.

### 3.3 `GET /api/agent/runs/:id` — poll status

```bash
curl http://localhost:3000/api/agent/runs/$RUN_ID \
  -H "Authorization: Bearer $TOKEN"
```

Response: `200` with:

```jsonc
{
  "id": "...",
  "status": "pending|running|success|failed|paused",
  "currentNode": "METRICS",          // from AgentRun.output, or null
  "nodeResults": {                    // per-node result map (latest)
    "INIT":    { "node": "INIT", "outcome": "done", "summary": "..." },
    "METRICS": { ... }
  },
  "startedAt":  "...",
  "finishedAt": "...",               // null until the run ends (not set if paused)
  "error": null                       // string on failure
}
```

`status` is a **bare string** column: `pending | running | success | failed |
paused`. `paused` means the run is awaiting human input on an escalated item
(see §4 L1); it is **not** mapped to `running`.

---

## 4. Autonomy levels & dry-run

These are the two safety levers on every run. They compose.

### 4.1 Autonomy levels (the `ConfirmationGate`)

Applies to **write** tools only (reads always execute):

| Level                | Behavior on a write                                                          |
|----------------------|------------------------------------------------------------------------------|
| `L1_COPILOT`         | Escalate **all** writes → run `paused`, awaits human approval.               |
| `L2_AUTOPILOT_LIGHT` | Auto-approve only if `risk==='low' && confidence>=0.7`; else escalate. **Default.** |
| `L3_FULL_AUTOPILOT`  | Allow all writes (still bounded by the gate's risk/confidence logging).      |

`risk` and `confidence` come from each agent's `__risk` / `__confidence` tool
metadata — the gate makes the final hard decision and never trusts the agent's
own "should I run this" judgment.

### 4.2 Dry-run semantics (read this carefully)

Dry-run is set in the POST body (`dryRun: true`) and stored on
`AgentRun.input`. **What it does depends on the autonomy level:**

- **At L2 / L3** (`dryRun: true`):
  The gate blocks **every** tool call — reads **and** writes — as *simulated*
  (`allowed:false, escalated:false, simulatedOutput`). Nothing executes, no side
  effects, no network calls to the browser-runner. The loop still walks all five
  nodes and completes with `status:success`. **This is the safe preview / test
  mode.** Use it to validate the loop wiring end-to-end without touching any
  external system.
- **At L1** (`dryRun: true` **or** `false`):
  Writes are escalated (`need_input` → run `paused`), regardless of the
  `dryRun` flag. **Reads still execute.** The handler deliberately forces
  `dryRun:false` at L1 — L1's contract is "escalate writes for human approval,"
  not "simulate." So `dryRun:true` at L1 does **not** turn reads into simulations;
  it just means "and also block writes via escalation."

Summary table:

| `autonomyLevel` | `dryRun` | Reads       | Writes                                  | Run completes?     |
|-----------------|----------|-------------|-----------------------------------------|--------------------|
| L1_COPILOT      | any      | execute     | escalate → `paused`                     | pauses on 1st write |
| L2 / L3         | `true`   | **simulated** | **simulated**                         | yes (`success`)    |
| L2              | `false`  | execute     | gate decision (auto or escalate)         | depends on gate    |
| L3              | `false`  | execute     | auto-execute                            | yes                |

### 4.3 State is persisted & queryable, not hot-resumable

Every step writes the full `SupervisorState` (current node, all node results,
escalated items, timestamps) into `AgentRun.output`, queryable via
`GET /api/agent/runs/:id`. This makes a run **inspectable and replayable for
debugging** (you can see exactly which node/decision caused an escalation).

The handler does **not** resume from `output` on re-enqueue. A re-triggered run
re-enters at `INIT`. **Hot resume from checkpoint is a second-cut feature**, not
a current capability — do not assume it.

---

## 5. Troubleshooting

### Browser-runner unreachable
- **Symptom:** real runs fail at the `PUBLISH` node with a connection error to
  the browser-runner; dry-run runs are unaffected.
- **Check:** `pnpm dev:browser-runner` is running; `BROWSER_RUNNER_URL` env
  points at it (defaults to `http://localhost:PORT`).
- **Note:** under dry-run (L2/L3) the browser-runner is never contacted, so an
  unreachable runner is invisible there — this only surfaces on real writes.

### Cookie / credential expiry
- **Symptom:** publish tools fail with auth/login errors.
- **Cookies live only inside the tool executor** (browser-runner), never in
  system prompts, LLM context, or logs. To refresh: re-run the platform's login
  flow via browser-runner; the executor persists the fresh cookie. Do **not**
  paste cookies into prompts or `curl`.
- Cookie sources per platform: see "Interaction Runtime Notes" in the root
  `README.md`.

### LLM timeout / provider errors
- **Symptom:** domain agent steps fail with timeout or 401/403 from the LLM.
- **Check:** `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` is set and valid;
  `LLM_PROVIDER` matches the key you provided.
- The handler catches errors, marks the run `failed` with the error string in
  `AgentRun.error`, and BullMQ retries (attempts: 2, exponential backoff 10s).

### Redis down
- **Symptom:** `POST /api/agent/runs` returns `200 { queued:false }`.
- **Meaning:** the `AgentRun` was still created (`pending`). The run is not lost.
- **Recovery:** start Redis (`pnpm docker:up`), then either re-POST or wait for
  the daily scheduler, which will create/execute a new run.

### Run stuck in `running` forever
- The supervisor has a guard (`guard < 10` steps) so it cannot loop infinitely.
- If a row shows `running` but no worker is processing it, the worker likely
  crashed mid-step. Check worker logs; the next scheduler tick or a manual
  re-trigger creates a fresh run (does not resume the stuck one — see §4.3).

---

## 6. Reference

- Design spec: [`docs/superpowers/specs/2026-06-18-agent-architecture-refactor-design.md`](../specs/2026-06-18-agent-architecture-refactor-design.md)
- Architecture overview: `## Architecture` in the root [`README.md`](../../../README.md)
- Runtime kernel source: `packages/runtime/src/`
- Worker handler: `apps/worker/src/job-handlers/agent.run.ts`
- API routes: `POST /api/agent/runs`, `GET /api/agent/runs/:id` in `apps/api/src/routes.ts`
- Architecture guard: `scripts/check-architecture-drift.ts` (run via `pnpm test:architecture`)
