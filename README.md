# AI Growth Ops

AI Native 的多平台获客运营系统:抖音 / 小红书 / 微信等平台的内容发布、互动抓取、线索分类与自动回复。浏览器自动化 + LLM 双驱动,选择器失效时由视觉模型兜底。

## 🚀 5 分钟本地启动

### 前置要求

- **Node.js v20+**(推荐 v24)— `node --version`
- **pnpm** — `npm i -g pnpm`
- **Docker Desktop**(提供 PostgreSQL / Redis / MinIO)— `docker --version`

### 一键启动

```bash
git clone <repo-url> ai-growth-ops && cd ai-growth-ops
cp .env.example .env      # 然后编辑 .env 填入 OPENAI_API_KEY(AI 能力需要)
./scripts/dev.sh
```

`dev.sh` 会自动:启动 docker 基础设施 → 安装依赖 → 迁移并 seed 数据库 → 启动 4 个服务。完成后打开:

| 服务 | 地址 | 说明 |
|---|---|---|
| **前端** | http://localhost:3001 | 主要操作界面 |
| API | http://localhost:3100 | 后端接口 |

**默认登录:** `admin@ai-growth-ops.local` / `changeme123`(首次登录后请改密码)

**停止服务:** `./scripts/stop.sh`(容器不受影响)

### 启动后做什么

1. **配置平台账号**:进入「集成 → 平台账号」,扫码登录抖音(会弹出浏览器窗口,用手机扫码)
2. **发布内容**:「内容」创建图文/视频 → 「发布」选择账号触发
3. **互动管理**:「对话」查看同步的评论/私信,AI 自动分类并生成回复建议
4. **配 LLM 增强**(强烈推荐):在 `.env` 填入有效 `OPENAI_API_KEY`,启用评论分类、回复生成、以及浏览器操作的**视觉兜底**(平台改版时自动用 vision 模型定位元素,避免选择器失效)

> 日志位于 `.dev-logs/`。详见下方 [Architecture](#architecture)。

---

## Scope

M0 project foundation for the AI growth ops system described in `spec/`.

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
