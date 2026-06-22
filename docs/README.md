# AI Growth Ops — 项目文档

## 项目概述

AI Growth Ops 是一个 AI 原生的全域内容营销运营平台，帮助 SMB 中小商家实现从调研→内容→发布→互动→线索→分析的全链路自动化。

## 架构

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│   Next.js   │───▶│  Node.js API │───▶│  PostgreSQL  │
│   Web 前端   │    │  (Port 3100) │    │  (Port 5432) │
└─────────────┘    └──────┬───────┘    └──────────────┘
                          │
                   ┌──────┴──────┐
                   │   BullMQ    │
                   │   Worker    │
                   └──────┬──────┘
                          │
                          ▼
                    Browser Runner
                       (:3200)
```

> **Agent runtime — first-cut execution boundary.** The unified agent runtime
> (`packages/runtime` + `apps/worker/src/job-handlers/agent.run.ts` +
> `POST /api/agent/runs`) supports **dry-run execution only** in this cut. The
> daily scheduler always creates runs with `input.dryRun = true`, and
> `POST /api/agent/runs` accepts only `L1_COPILOT` and `L2_AUTOPILOT_LIGHT`
> (`L3_FULL_AUTOPILOT` is rejected with `400` — it is a future goal). The API
> still accepts `dryRun:false`, but **real (non-dry-run) runs are NOT functional
> in this cut**: they will fail at the tool-execution boundary (e.g. the
> `PUBLISH` node) because the second-cut platform-cookie injection that loads
> decrypted credentials into tool inputs is not yet wired. Use `dryRun:true`
> for all previews / tests. See
> [`docs/superpowers/runbooks/agent-runtime-runbook.md`](./superpowers/runbooks/agent-runtime-runbook.md) §4 for the full semantics.

### 技术栈

| 层级         | 技术                                                           |
| ------------ | -------------------------------------------------------------- |
| 前端         | Next.js 14 (App Router), React Query, TanStack Table, Recharts |
| API          | Node.js 20 (原生 http), Prisma ORM, Zod 验证                   |
| Worker       | BullMQ + Redis                                                 |
| 数据库       | PostgreSQL 16                                                  |
| 缓存         | Redis 7                                                        |
| 对象存储     | MinIO (S3 兼容)                                                |
| 浏览器自动化 | Playwright                                                     |
| 邮件         | Resend (生产) / Console (开发)                                 |
| 包管理       | pnpm workspaces (monorepo)                                     |

### Monorepo 结构

```
apps/
  api/              — API 服务 (Node.js http server)
  web/              — Next.js 前端
  worker/           — BullMQ 异步任务处理器
  browser-runner/   — Playwright 浏览器自动化服务

packages/
  database/         — Prisma schema + 数据库客户端
  shared/           — 共享工具函数
  shared-types/     — 共享类型定义
  observability/    — 日志和监控
  providers/        — AI 提供商抽象
  skills/           — AI 技能系统
  connectors/       — 平台连接器 (抖音/小红书/微信等)
  email/            — 邮件发送服务
  capability-schema/— 能力模式定义
```

## 快速开始

### 环境要求

- Node.js 20+
- pnpm 9+
- PostgreSQL 16
- Redis 7

### 安装

```bash
# 克隆仓库
git clone <repo-url> && cd ai-growth-ops

# 安装依赖
pnpm install

# 配置环境变量
cp .env.template .env
# 编辑 .env 填入实际配置

# 启动基础设施
docker compose up -d postgres redis minio

# 初始化数据库
pnpm --filter @ai-growth-ops/database db-push

# 构建共享包
pnnpm -r build

# 启动开发服务
pnpm --filter @ai-growth-ops/api dev     # API
pnpm --filter @ai-growth-ops/web dev     # 前端
pnpm --filter @ai-growth-ops/worker dev  # Worker
```

## 关键特性

- **多租户**: Organization 模型隔离，RBAC 权限 (owner/admin/member/viewer)
- **邮件系统**: 注册验证、密码重置、团队邀请、通知摘要
- **通知系统**: 实时通知 + Webhook 触发 + 邮件通知
- **定时发布**: SCHEDULED 状态自动检查并执行
- **CSV 导出**: 线索/内容/互动数据导出 (UTF-8 BOM)
- **API 验证**: Zod schema 输入验证 + 分页
- **暗色模式**: 全站 dark mode 支持
- **移动端适配**: 底部导航栏 + 响应式表格
- **新手引导**: 3 步引导流程
- **Docker**: 一键部署 docker-compose

## 更多文档

- [部署指南](./deployment.md)
- [API 参考](./api-reference.md)
- [环境变量配置](./configuration.md)
- [系统架构](./architecture.md)
- [贡献指南](./contributing.md)
