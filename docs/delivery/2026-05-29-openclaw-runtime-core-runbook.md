# OpenClaw Runtime Core Runbook

## 1. Preflight

Run:

```bash
node --version
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts doctor
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts accounts:list
```

Expected on this machine:

- `douyin` accounts: `default`, `main`
- `kuaishou` accounts: `default`
- `wechat_channels` accounts: `default`

## 2. Start browser-runner when needed

For interaction fetch, or browser-runner fallback publish:

```bash
./node_modules/.bin/tsx apps/browser-runner/src/server.ts
```

## 3. Safe demo order

### A. Capability demo

```bash
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts skills:list
```

### B. Live auth check demo

```bash
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=auth.check --platforms=douyin --account=main
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=auth.check --platforms=wechat_channels --account=default
```

### C. Live publish path demo

Use a real local video path:

```bash
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=douyin --account=main --title="Demo Title" --file=/absolute/path/video.mp4 --content=hello
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=wechat_channels --account=default --title="Demo Title" --file=/absolute/path/video.mp4 --content=hello
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=kuaishou --account=default --title="Demo Title" --file=/absolute/path/video.mp4 --content=hello
```

### D. Interaction demo

If `AI_GROWTH_OPS_XIAOHONGSHU_COOKIE` is set:

```bash
AI_GROWTH_OPS_XIAOHONGSHU_COOKIE=<cookie> ./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=interaction.fetch --platforms=xiaohongshu --account=demo
```

If not set, the command will return a structured `cookie_not_found` block result. That is expected behavior.

### E. Wechat Official publish demo

If `AI_GROWTH_OPS_WECHAT_OFFICIAL_COOKIE` is set:

```bash
export AI_GROWTH_OPS_WECHAT_OFFICIAL_COOKIE='<cookie>'
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=auth.check --platforms=wechat_official
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=wechat_official --title="Demo Article" --content="hello"
```

If not set, the command will return `cookie_not_found` or `missing:["cookie"]`. That is expected behavior.

## 4. Interpretation guide

- `mode=executed`: runtime-core called a real executor
- `mode=validated`: auth check used a real provider validation
- `mode=planned`: capability is known, but execution is blocked by missing cookie or other required input
- `mode=blocked`: interaction flow is blocked by missing prerequisites

## 5. Current live scope on this machine

- Live publish/auth via local CLI:
  - `douyin`
  - `wechat_channels`
  - `kuaishou`
- Browser-runner fallback path wired:
  - `xiaohongshu`
  - `wechat_official`
  - `zhihu`
  - `baijiahao`
