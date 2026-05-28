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

Example commands:

```bash
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts skills:list
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
