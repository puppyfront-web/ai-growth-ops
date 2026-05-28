# AI Growth Ops

M0 project foundation for the AI growth ops system described in `spec/`.

## Scope

This stage creates the workspace skeleton only:

- `apps/web`
- `apps/api`
- `apps/worker`
- `apps/provider-gateway`
- `apps/browser-runner`
- `apps/research-runner`
- `packages/shared`
- `packages/database`
- `packages/connectors`
- `packages/providers`
- `packages/skills`
- `packages/ai`
- `packages/lead-sinks`
- `packages/observability`

Current apps expose typed health-check functions and package placeholders so the workspace can lint, test, and build before deeper business implementation starts.

## Runtime Core MVP

The repository now includes an AI Native `runtime-core` app intended for OpenClaw-style installs.

Current live local CLI publish/auth support in this environment:

- `douyin`
- `wechat_channels` via `tencent`
- `kuaishou`

Other publish capabilities remain registered as disabled placeholders until a compatible local executor is installed.

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

Example commands:

```bash
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts skills:list
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=auth.check --platforms=douyin --account=<account>
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=douyin --content=hello
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=interaction.fetch --platforms=xiaohongshu
```

## Commands

```bash
pnpm install
pnpm lint
pnpm test
pnpm build
pnpm docker:up
```

## Infrastructure

`docker-compose.yml` starts local PostgreSQL, Redis, and MinIO services for future stages.
