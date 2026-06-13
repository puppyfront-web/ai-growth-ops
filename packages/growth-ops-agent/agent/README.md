# Growth-Ops Agent — portable operations agent

A self-contained agent that runs daily growth operations on Chinese public-content
platforms (Douyin first) against a **real, authenticated creator account**. Three
artifacts that install identically into any MCP-capable runtime:

- **`SKILL.md`** — the operator skill (the daily loop剧本: 今日数据 → 公域线索 → 分级 → 回复 → 内容 → 发布 → 复盘).
- **`agent.json`** — the manifest (capabilities, contexts, MCP server config) for listing/install.
- **MCP server** (`@ai-growth-ops/growth-ops-agent`) — exposes the tools the skill calls.

The MCP server is a thin proxy over the **browser-runner** service (`apps/browser-runner`),
which drives a stealth Playwright session for QR login, content statistics, comments,
and publishing. Run browser-runner once (it holds the browser); the MCP server points at it.

## Prerequisites

1. **browser-runner running** on `http://localhost:3200` (its default port). From the repo root:
   ```sh
   pnpm --filter @ai-growth-ops/browser-runner dev   # or however you start it
   ```
   It reads `BROWSER_RUNNER_SECRET` (or `TOKEN_ENCRYPTION_KEY`) from the repo-root `.env`
   and uses it as the shared Bearer secret. The MCP server reads the same secret.
2. **Build this package**:
   ```sh
   pnpm --filter @ai-growth-ops/growth-ops-agent build
   ```

## Install in Claude Code

Register the MCP server, then drop the skill in your skills directory:

```sh
claude mcp add growth-ops-agent \
  --env BROWSER_RUNNER_URL=http://localhost:3200 \
  --env BROWSER_RUNNER_SECRET="$BROWSER_RUNNER_SECRET" \
  -- node /absolute/path/to/packages/growth-ops-agent/dist/index.js
```

Copy `agent/SKILL.md` into your Claude Code skills folder
(`~/.claude/skills/growth-ops-operator/SKILL.md`), then restart the session. Ask
Claude to "run today's growth ops on Douyin" and it will follow the loop in `SKILL.md`.

## Install in Codex (or any MCP runtime)

1. Add the server to Codex's MCP config with the same `command`/`args`/`env` as the `mcp`
   block in `agent.json`.
2. Place `SKILL.md` where Codex loads agent skills (e.g. its skills/AGENTS dir).
3. Restart. No per-runtime code changes — the skill + manifest + server are runtime-agnostic.

## Headless / test runs without a QR scan

Set `GROWTH_OPS_COOKIE_FILE=/tmp/dy-cookie.txt` (and optionally
`GROWTH_OPS_COOKIE_PLATFORM=douyin`) so the server seeds the cookie at startup. Useful for
verification; production uses the `auth_login` → `auth_status` QR handshake.

## Tools

| Tool | Capability | R/W | Notes |
|---|---|---|---|
| `auth_login` / `auth_status` | auth.login / auth.check | — | QR handshake |
| `content_list_videos` | content.list_videos | R | real video statistics (primary data source) |
| `interaction_fetch_comments` | interaction.fetch_comments | R | scraper rot → often empty |
| `interaction_fetch_messages` | interaction.fetch_messages | R | scraper rot → often empty |
| `interaction_reply_comment` | interaction.reply_comment | W | human-gated (`confirmed`) |
| `interaction_reply_message` | interaction.reply_message | W | human-gated |
| `lead_search` | lead.extract | R | keyword prospecting in the 公域 |
| `publish_video` | publish.video | W | human-gated; Douyin requires media |
| `publish_check_status` | publish.video | R | review state |

## Known debt (non-blocking)

The public comment-page and private-message read paths are rotted on Douyin (comment
URLs moved, notification inbox empty). Those tools ship but return empty until refreshed.
`content_list_videos` (creator `work_list`) returns real statistics and is the reliable
data source. Scraper refresh is tracked separately.
