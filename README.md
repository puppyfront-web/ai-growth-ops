# AI Growth Ops

AI Native 的多平台获客运营系统：抖音 / 小红书 / 微信等平台的内容发布、互动抓取、关键词获客、线索分类与客户管理。浏览器自动化 + LLM 双驱动，选择器失效时由视觉模型兜底。

系统设计为**部署到用户本地/办公室机器**运行（单机本地 Runtime）：登录、权限、客户、内容、任务、素材和第三方凭据全部保存在用户设备的 `LOCAL_DATA_DIR`，不依赖云端控制面。浏览器与用户在同一台机器上，平台风控友好度最高。

## 🚀 5 分钟本地启动

### 前置要求

- **Node.js v20+**（推荐 v24）— `node --version`
- **pnpm** — `npm i -g pnpm`
- **Docker Desktop**（提供 PostgreSQL / Redis / MinIO）— `docker --version`

### 一键启动

```bash
git clone <repo-url> ai-growth-ops && cd ai-growth-ops
cp .env.example .env      # 然后编辑 .env 填入 OPENAI_API_KEY（AI 能力需要）
./scripts/dev.sh
```

`dev.sh` 会自动：启动 docker 基础设施 → 安装依赖 → 迁移并 seed 数据库 → 启动 4 个服务。完成后打开：

| 服务 | 地址 | 说明 |
|---|---|---|
| **前端** | http://localhost:3001 | 主要操作界面 |
| API | http://localhost:3100 | 后端接口 |

**默认登录：** `admin@ai-growth-ops.local` / `changeme123`（首次登录后请改密码）

**停止服务：** `./scripts/stop.sh`（容器不受影响）

### 启动后做什么

1. **配置平台账号**：进入「集成 → 平台账号」添加账号并点击登录 —— 系统会在本机弹出真实浏览器窗口展示平台完整登录页，直接在窗口里扫码并完成验证方式选择/短信验证码，无需安装任何额外软件；登录成功后 Cookie 加密保存，窗口自动关闭
2. **发布内容**：「内容」创建图文/视频 → 「发布」选择账号触发
3. **智能获客**：「获客」描述目标客户 → 系统按关键词搜索视频、抓取评论、AI 语义打分、去重入库为潜客
4. **互动管理**：「对话」查看同步的评论/私信，AI 自动分类并生成回复建议
5. **配 LLM 增强**（强烈推荐）：在 `.env` 填入有效 `OPENAI_API_KEY`，启用评论分类、回复生成、以及浏览器操作的**视觉兜底**（平台改版时自动用 vision 模型定位元素，避免选择器失效）

> 日志位于 `.dev-logs/`。团队成员通过邮箱邀请加入同一组织，按角色分权使用（组织/邀请/权限均为本地数据）。

### 多人使用

整套系统跑在一台常开机器（办公室 Mac mini / 小主机）上，团队通过内网地址访问即可协作：数据按组织隔离、平台账号组织级共享、任务队列串行执行。远程访问建议用 Tailscale/WireGuard 组网，不要直接暴露公网。容量上交互使用几十人无压力，实际瓶颈是平台账号数量与爬取吞吐（频控守卫按账号限速，属风控安全设计）。

---

## 能力与配置（回复功能必读）

系统对不同认证模式的能力支持不同，**自动回复的可靠性取决于账号配置方式**：

| 能力 | `browser_assist`（扫码登录） | `official_api`（开放平台） |
|---|---|---|
| 监控评论/私信（抓取） | ✅ 稳定 | ✅ 稳定 |
| 内容发布 | ✅ 稳定 | ✅ 稳定 |
| **自动回复评论/私信** | ⚠️ **尽力而为**（受抖音 web 签名风控，需人工复核） | ✅ **稳定**（官方 API） |
| 线索分类/回复建议 | ✅ AI 驱动 | ✅ AI 驱动 |

**要让自动回复可靠工作（自动驾驶），账号必须配 `official_api` 模式：**

1. 在[抖音开放平台](https://open.douyin.com)注册应用，拿到 `client_key` / `client_secret`
2. 用 OAuth 流程给目标账号授权，获取 `access_token`（存入账号的 `accessTokenEncrypted`）
3. 系统会自动用官方 `/comment/reply/`、`/im/message/send/` 发送回复

> `browser_assist` 模式的回复受限于抖音对网页版评论发布 API 的签名风控（X-Bogus/a_bogus），会间歇性失败，因此该模式下回复会标记为需要人工复核。**监控、抓取、发布、线索管理在两种模式下都稳定可用。**

> 平台能力的真实验收状态以 [`docs/delivery/crm-release-status.md`](docs/delivery/crm-release-status.md) 为准。

---

## 账号扫码登录（默认）

在用户机器上运行时，登录链路为：Web 弹窗发起 → browser-runner 在本机以**有头模式弹出真实浏览器窗口**展示平台完整登录页 → 用户在窗口内扫码、选择验证方式、输入验证码 → 系统检测到登录态后校验 Cookie 白名单并加密入库。

- 无显示服务的环境（无 DISPLAY 的容器）自动降级：无头打开登录页，二维码在网页弹窗中展示；
- 采集会话按账号使用**持久化浏览器 Profile**（`LOCAL_DATA_DIR/browser-profiles`），浏览器环境随使用累积信任，降低被平台风控识别的概率；
- 早期的「浏览器助手」本机授权方案代码保留可用（`apps/browser-bridge` + `/api/browser-bridge/*`），当前不再是默认入口。

## Commands

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm docker:up
```

## Workspace

- `apps/web` — Next.js 前端（App Router + React Query）
- `apps/api` — Node HTTP 路由 + Zod 校验
- `apps/worker` — BullMQ Worker（获客/同步等异步任务）
- `apps/browser-runner` — Playwright/CDP 浏览器自动化（登录、采集、发布）
- `apps/browser-bridge` — 浏览器助手（本机 Chrome 授权桥，保留可选）
- `packages/runtime` — runtime-agnostic Agent 内核（禁止反向依赖 `apps/*`）
- `packages/database` / `shared` / `connectors` / `providers` / `skills` / `ai` / `lead-sinks` / `observability` — 数据、纯逻辑与适配层

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

This refactor is **increment-only**: legacy `ai-tools`, `growth-ops-agent`, and
`workflow.execute` paths remain in place until a second cut validates their
removal. The architecture guard (`pnpm test:architecture`) warns on legacy
usage and errors on any kernel → `apps/*` dependency.

Operations guide: [`docs/superpowers/runbooks/agent-runtime-runbook.md`](docs/superpowers/runbooks/agent-runtime-runbook.md).

## Infrastructure & Docs

`docker-compose.yml` starts local PostgreSQL, Redis, and MinIO services. 生产/办公室单机部署见 `docker-compose.prod.yml` 与 [`docs/deployment.md`](docs/deployment.md)；本地数据边界（存储/备份/恢复）见 [`docs/delivery/local-first-data-boundary.md`](docs/delivery/local-first-data-boundary.md)。
