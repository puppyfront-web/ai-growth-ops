# 环境变量配置

## 必须配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://postgres:postgres@localhost:5432/ai_growth_ops` |
| `REDIS_URL` | Redis 连接串 | `redis://localhost:6379` |
| `AUTH_SECRET` | JWT 签名密钥 (至少 32 字符) | — |
| `APP_URL` | 应用 URL (用于生成邮件链接) | `http://localhost:3000` |

## 邮件配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EMAIL_PROVIDER` | 邮件提供商: `console` (开发) / `resend` (生产) | `console` |
| `RESEND_API_KEY` | Resend API Key (EMAIL_PROVIDER=resend 时必须) | — |
| `EMAIL_FROM` | 发件人地址 | `AI Growth Ops <noreply@aigrowthops.com>` |

## AI 提供商

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | OpenAI API Key |
| `ANTHROPIC_API_KEY` | Anthropic API Key (可选) |
| `DEEPSEEK_API_KEY` | DeepSeek API Key (可选) |

## 平台连接

| 变量 | 说明 |
|------|------|
| `WECHAT_APP_ID` | 微信公众号 App ID |
| `WECHAT_APP_SECRET` | 微信公众号 App Secret |
| `DOUYIN_CLIENT_KEY` | 抖音开放平台 Client Key |
| `DOUYIN_CLIENT_SECRET` | 抖音开放平台 Client Secret |

## 对象存储

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MINIO_ENDPOINT` | MinIO 地址 | `localhost` |
| `MINIO_PORT` | MinIO 端口 | `9000` |
| `MINIO_ACCESS_KEY` | MinIO Access Key | `minioadmin` |
| `MINIO_SECRET_KEY` | MinIO Secret Key | `minioadmin` |
| `MINIO_BUCKET` | 存储桶名称 | `ai-growth-ops` |

## 服务端口

| 变量 | 服务 | 默认值 |
|------|------|--------|
| `API_PORT` | API 服务 | `3100` |
| `WEB_PORT` | Web 前端 | `3000` |
| `BROWSER_RUNNER_PORT` | 浏览器自动化 | `3200` |
| `PROVIDER_GATEWAY_PORT` | 平台网关 | `3300` |
| `RESEARCH_RUNNER_PORT` | 调研服务 | `3400` |

## 可选配置

| 变量 | 说明 |
|------|------|
| `LOG_LEVEL` | 日志级别: debug/info/warn/error |
| `SENTRY_DSN` | Sentry 错误监控 |
| `NEXT_PUBLIC_API_MOCKING` | 前端 Mock 模式: `enabled` |
