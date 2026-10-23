# AI Growth Ops

AI Native 的多平台获客运营系统：内容生产与发布、评论私信承接、关键词获客、线索与客户管理、商机与经营分析。浏览器自动化 + LLM 双驱动，选择器失效时由视觉模型兜底。

系统设计为**部署到用户本地/办公室机器**运行（单机本地 Runtime）：登录、权限、客户、内容、任务、素材和第三方凭据全部保存在用户设备的 `LOCAL_DATA_DIR`，不依赖云端控制面。浏览器与用户在同一台机器上，平台风控友好度最高。

## 功能模块使用介绍

左侧导航按「获客 → 运营 → 配置」组织。各模块的能力状态如实标注：✅ 已验证 / 🧪 Beta（部分验证）/ ⏳ 未验收，与 [能力矩阵](docs/delivery/crm-release-status.md) 保持一致。

### 获客

**工作台** `/dashboard` — 首页总览：客户、线索、任务等关键指标卡片与快捷入口，数据来自真实聚合查询。

**智能获客** `/prospecting` ✅（抖音）/ 🧪（小红书） — 用一句自然语言描述目标客户（如"需要宿舍风扇的家长"），AI 识别意图并生成多策略采集计划；确认预算后系统按关键词搜索视频、抓取评论区、语义打分（A/B/C/D 潜客等级）、跨任务去重。结果列表支持关键词/相关度/意向等级/转化状态筛选与分页，可将高潜用户一键转为客户（保留来源证据）。按账号持久化浏览器 Profile 采集，内置频控与验证码守卫，多账号按健康度自动调度。

**客户管理** `/customers` ✅ — 运营主入口。客户列表按渠道/状态/负责人筛选，支持新建/编辑（姓名、电话、邮箱、IM 账号）、CSV 批量导入（预览 + 列映射 + 重复检测）、重复客户合并。详情页聚合：跟进动态时间线、AI 客户画像、商机、触达记录、飞书/企微同步状态、下次动作与 SLA。线索赢单、表单提交、获客转化都会汇入同一客户体系。

**线索管理** `/leads` ✅ — 平台互动（评论/私信/表单/询盘）产生的线索池：列表与详情（活动时间线、状态流转 NEW→…→WON/LOST、分配）、线索管道看板、自动分配规则、来源管理（创建 Webhook token 供外部系统推送）、合规敏感词规则、飞书/企微沉淀配置。线索与客户状态由领域服务双向同步，赢单自动补建/关闭商机。

**触达运营** `/outreach` 🧪 — 按序列（多步骤 + 间隔 SLA）对客户做持续触达：创建序列 → 圈选客户 enroll → 到期 touch 进入待办 → 人工执行并记录结果；支持暂停/恢复/取消与抑制名单。渠道闸门（电话/手工 = 可用，邮件/企微/抖音私信 = 未验收）明确标注每个渠道的发送能力，未验收渠道当前为人工执行 + 记录模式。

**表单获客** `/forms` ✅ — 创建公开获客表单，自动生成落地页 `/f/<slug>`（可嵌官网/社群）。访客提交按手机号去重创建或关联客户，走自动分配规则路由负责人并发通知；提交记录与表单字段可随时调整。分配规则（按渠道/等级等条件指派）在此与线索侧共用。

**商机管道** `/deals/pipeline` ✅ — 商机阶段看板：new → contacted → qualified → proposal → negotiation → won/lost。拖拽或编辑更新阶段，金额精确到分；赢单/输单自动反向同步客户与线索状态并触发 Webhook，重开需填写原因。配套逾期跟进视图（线索/客户/商机统一队列）。

**经营漏斗** `/analytics/funnel` ✅ — 全链路转化漏斗：发布 → 互动 → 线索 → 客户 → 商机 → 成交收入，逐层真实聚合（非抽样）。配合逾期跟进队列定位卡单环节。

**成本与 ROI** `/analytics/efficiency` ✅ — 登记营销成本（渠道/日期/金额），自动计算 CPL / CAC / ROI；支持首触/末触/线性三种归因模型对比；基于商机历史给出销售预测。帮你看清"每个渠道花多少钱、带来多少客户和收入"。

**实验与 A/B** `/experiments` ✅ — 创建实验（变体 + 成功指标），发布任务与触达发送自动按稳定哈希分流，商机赢单回写转化事件（幂等去重）。结果页给出 p 值显著性判断，样本不足（每组 < 30）或 p ≥ 0.05 时不会宣布胜出，避免误读。

**获客分析** `/analytics/lead` ✅ — 获客任务 / 潜客 / 客户维度的来源分析：哪些关键词、账号、策略带来了高意向客户，转化率如何。

### 运营

**内容运营** `/content` ✅ — 内容项目与图文/视频创作：AI 生成初稿、多变体管理、人工编辑定稿。

**发布运营** `/publish` ✅ — 发布任务：选择内容 + 平台账号（可定时），队列串行执行，状态与失败原因可查，支持重试。

**评论私信** `/conversations` 🧪 — 同步的评论/私信会话池：AI 自动分类（询价/咨询/无关等）并生成回复建议，人工审核后发送。抓取与分类稳定；**自动回复为尽力而为**（见下方能力表），高风险内容必须人工确认。

**通知中心** `/notifications` ✅ — 新线索、表单提交、询盘接入、SLA 跟进超时等系统通知，点击直达对应客户/线索。

### 配置

**集成配置** `/integrations` — 平台账号管理：添加账号并扫码登录（本机弹出真实浏览器窗口，Cookie 加密入库）、健康检查、能力开关、平台能力矩阵（各平台哪些能力已验证/Beta/未验收一目了然）、出站 Webhook 配置（customer/deal/lead 事件）。

**系统设置** `/settings` — 组织与成员（邮箱邀请、角色权限）、组织级 LLM 模型配置（服务端唯一来源）、审计日志。

### 数据接入（API）

除页面操作外，支持三种程序化入口：

| 方式 | 说明 |
|---|---|
| 询盘 Webhook | `POST /api/inquiries/webhook`（Header `X-Webhook-Token`，token 在线索来源页创建）：任意 IM 渠道询盘实时写入客户体系，按 手机号→邮箱→IM 账号 三级去重，自动分配 + 通知。渠道支持 WhatsApp/Telegram/微信/邮件等别名归一化 |
| 线索 Webhook | `POST /api/leads/webhook/ingest`：外部系统推送线索 |
| CSV 导入 | 客户管理页导入，或 `POST /api/customers/import`（预览 + 映射） |

出站 Webhook：`customer.created/won/lost`、`deal.won/lost`、`lead.created`。

## 🚀 5 分钟本地启动

### 前置要求

- **Node.js v20+**（推荐 v24）— `node --version`
- **pnpm** — `npm i -g pnpm`
- **Docker Desktop**（提供 PostgreSQL / Redis / MinIO）— `docker --version`

### 一键启动

```bash
git clone https://github.com/puppyfront-web/ai-growth-ops.git ai-growth-ops && cd ai-growth-ops
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

1. **配置平台账号**：进入「集成配置 → 平台账号」添加账号并点击登录 —— 系统会在本机弹出真实浏览器窗口展示平台完整登录页，直接在窗口里扫码并完成验证方式选择/短信验证码，无需安装任何额外软件；登录成功后 Cookie 加密保存，窗口自动关闭
2. **发布内容**：「内容运营」创建图文/视频 → 「发布运营」选择账号触发
3. **智能获客**：「智能获客」描述目标客户 → 系统按关键词搜索视频、抓取评论、AI 语义打分、去重入库为潜客
4. **互动管理**：「评论私信」查看同步的评论/私信，AI 自动分类并生成回复建议
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

## 参与共建 / 安全 / 许可证

- 贡献指南（SDD + TDD 工作流）：[CONTRIBUTING.md](./CONTRIBUTING.md)
- 安全披露：[SECURITY.md](./SECURITY.md)
- 许可证：[Apache-2.0](./LICENSE) — 允许商业使用、修改与再分发（需保留版权与许可证声明，修改需注明）
