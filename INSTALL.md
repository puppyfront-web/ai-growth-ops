# INSTALL

## Goal

将 `ai-growth-ops` 安装为一套可在 OpenClaw 环境中使用的 AI Native 运营执行内核，并完成发布 / 互动运营的基础可用配置。

## 1. System Requirements

- macOS with local browser access
- Node.js `v24` or newer
- A working OpenClaw runtime environment
- Local access to the repository files
- For interaction features:
  - available platform cookie
  - ability to start `browser-runner`

## 2. Repository Setup

In the repository root, verify the environment:

```bash
node --version
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts doctor
```

Expected:

- Node prints a version
- `doctor` returns a JSON report with:
  - `socialPublishSkillsRoot.exists: true`
  - a valid `browserRunnerUrl`
  - the currently detected local accounts and live platforms

## 3. Runtime Core Verification

Run the minimum checks:

```bash
./node_modules/.bin/tsc --project apps/runtime-core/tsconfig.json --noEmit
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts accounts:list
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts skills:list
```

## 4. Live Publish Scope On This Machine

Current live publish/auth platforms:

- `douyin`
- `wechat_channels` via `tencent`
- `kuaishou`

Current browser-runner fallback publish paths:

- `xiaohongshu`
- `zhihu`
- `baijiahao`

Currently not live:

- `wechat_official`

## 5. Local Account Discovery

List currently available local publish accounts:

```bash
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts accounts:list
```

Expected on the current delivery machine:

- `douyin`: `default`, `main`
- `kuaishou`: `default`
- `wechat_channels`: `default`

## 6. Auth Check

Before publishing, verify account readiness.

Examples:

```bash
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=auth.check --platforms=douyin --account=main
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=auth.check --platforms=wechat_channels --account=default
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=auth.check --platforms=kuaishou --account=default
```

Interpretation:

- `status=success`: cookie/auth is valid
- `status=failed` with `cookie_not_found`: the account cookie is missing
- `status=failed` with provider error: the cookie exists but is invalid or expired

## 7. Publish Usage

Use a real local media file path.

Examples:

```bash
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=douyin --account=main --title="Demo Title" --file=/absolute/path/video.mp4 --content=hello
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=wechat_channels --account=default --title="Demo Title" --file=/absolute/path/video.mp4 --content=hello
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=kuaishou --account=default --title="Demo Title" --file=/absolute/path/video.mp4 --content=hello
```

If the file path is wrong, the command will return a structured error such as:

```json
{
  "workflow": "publish",
  "status": "failed"
}
```

and the result detail will include the concrete executor error.

## 8. Interaction Setup

Interaction operations require:

1. a valid platform cookie
2. a running `browser-runner`

Start browser-runner:

```bash
./node_modules/.bin/tsx apps/browser-runner/src/server.ts
```

### Xiaohongshu interaction cookie

Provide the cookie through an environment variable:

```bash
export AI_GROWTH_OPS_XIAOHONGSHU_COOKIE='<cookie>'
```

Then run:

```bash
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=interaction.fetch --platforms=xiaohongshu --account=demo
```

If cookie is missing, the system returns a structured blocked result instead of pretending success.

## 9. Delivery Commands

Recommended delivery sequence:

```bash
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts doctor
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts accounts:list
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts skills:list
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=auth.check --platforms=douyin --account=main
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=douyin --account=main --title="Demo Title" --file=/absolute/path/video.mp4 --content=hello
```

For the full handoff checklist, see:

- [docs/delivery/2026-05-29-openclaw-runtime-core-checklist.md](/Users/tutu/apps/ai-growth-ops/docs/delivery/2026-05-29-openclaw-runtime-core-checklist.md)
- [docs/delivery/2026-05-29-openclaw-runtime-core-runbook.md](/Users/tutu/apps/ai-growth-ops/docs/delivery/2026-05-29-openclaw-runtime-core-runbook.md)
