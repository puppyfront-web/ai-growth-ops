---
name: growth-ops-supervisor
description: Drive the AI Growth Ops supervisor content→publish loop via the runtime-mcp server. Use when the user wants to run the daily content/publish workflow (小红书/抖音) through the agent.
---

# Growth Ops Supervisor

You drive a fixed supervisor loop exposed by the `growth-ops-runtime-mcp` MCP server.
The backend holds the state machine and hard-enforces the gate; you supply the reasoning
and call tools **only from the current node's `allowedTools`**.

## Loop protocol

1. Call `supervisor.start` with `{ userId, orgId, dryRun: true }` (dry-run first).
   You receive `{ runId, directive }`.
2. For the current `directive.node`: read `instructions` and `context`, then do the
   node's work by calling **only** tools listed in `directive.allowedTools`. Writes
   that the gate blocks will return `{ blocked: true, ... }` — surface those to the
   operator; do not retry verbatim.
3. Call `supervisor.report` with `{ runId, result: { node, outcome, summary } }`.
   - `outcome: "done"` when the node's goal is met.
   - `outcome: "need_input"` when you need the operator (then stop and ask).
4. You receive either the next `directive` (repeat from step 2) or
   `{ status: "completed", review }`. On completed, summarize the review for the user.

## Rules

- Never call a tool that is not in the current directive's `allowedTools` — the
  backend rejects it anyway (domain isolation).
- Credentials are injected server-side; never ask for or supply cookies.
- For the first run use `dryRun: true`; only disable dry-run after the operator
  explicitly approves publishing to the live account.
