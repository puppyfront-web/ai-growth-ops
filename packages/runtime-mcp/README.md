# @ai-growth-ops/runtime-mcp

Host-native MCP server for the AI Growth Ops supervisor. Any MCP host
(Claude Code, OpenClaw) drives the content→publish loop; the host supplies the LLM,
this server holds the state machine and hard-enforces the gate, domain isolation,
and credential safety.

## Run (stdio)

```bash
pnpm --filter @ai-growth-ops/runtime-mcp build
node packages/runtime-mcp/dist/index.js
```

## Mount in Claude Code

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "growth-ops": { "command": "node", "args": ["packages/runtime-mcp/dist/index.js"] }
  }
}
```

Then use the `growth-ops-supervisor` skill (in `skills/growth-ops-supervisor/`).

## Tools

- `supervisor.start` / `supervisor.report` — the loop driver.
- Every registry tool (`content.*`, `publish.*`, `auth.*`) — proxied through the
  gate-enforcing executor; writes pass `ConfirmationGate`, cookies injected server-side.

## Modes

- **Host mode (default):** host LLM executes inside each node.
- **Scheduled mode (follow-up plan):** worker calls `runDomainAgent` with the default
  `LLMClient` for untended daily runs.

See `docs/superpowers/specs/2026-06-23-portable-supervisor-runtime-design.md`.

## Safety boundary (backend-hard-enforced, not host-cooperation)

- **Domain isolation:** a tool call outside the active node agent's `allowedTools` is
  rejected before execution.
- **Write gate:** every `mutate=Write` tool passes `ConfirmationGate.check` — dry-run
  blocks, L1/L2 escalate, L3 auto. Read tools skip the gate (side-effect-free).
- **Credentials:** cookies are resolved server-side from the `CredentialResolver` and
  injected into the tool call; they never live in the host LLM context.
- **Output scrub:** every tool result passes `scrubSensitiveOutput` before return.
