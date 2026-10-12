# 部署指南

当前容器部署是单机本地 Runtime，所有持久数据保存在用户指定的 `LOCAL_DATA_DIR`。正式启用真实平台发布前，还必须完成 [交付规范](./delivery/crm-release-spec.md) 中的真实平台与恢复验收。

## 环境与密钥

设备建议 Docker 24+、Docker Compose v2、至少 4 GB 内存和 2 CPU。构建机上如需直接执行 `pnpm install` / `pnpm verify:release`，要求 Node.js 22.12+（仓库 `.nvmrc` 与 `engines` 已钉住）与 pnpm 10.33.0。复制模板并填写配置：

```sh
cp .env.example .env
chmod 600 .env
```

生产至少要替换下列值；不要保留 `CHANGE_ME`、`postgres`、`minioadmin` 或开发管理员密码：

```env
POSTGRES_PASSWORD=<可安全放入连接串的强密码>
AUTH_SECRET=<openssl rand -hex 32>
TOKEN_ENCRYPTION_KEY=<openssl rand -hex 32>
INTERNAL_API_SECRET=<openssl rand -hex 32>
BROWSER_RUNNER_SECRET=<openssl rand -hex 32>
MINIO_ROOT_PASSWORD=<强密码>
ADMIN_PASSWORD=<首次管理员强密码>
APP_URL=http://127.0.0.1:3001
LOCAL_DATA_DIR=/absolute/path/to/ai-growth-ops-data
```

`TOKEN_ENCRYPTION_KEY` 用于解密本地保存的平台和模型凭据，备份后不得随意更换。`LOCAL_DATA_DIR` 必须位于用户控制的持久磁盘；不要放入公开目录或未经确认的云盘同步目录。PostgreSQL、Redis、MinIO、API、Worker 和 Browser Runner 都使用这个目录，不再配置云端控制面数据库。

## 阿里云 ECS 快速部署（推荐）

服务器上只需要 Docker 和 Git，构建、迁移、初始化全部在容器内完成：

```sh
# 1. 服务器初始化（一次性；Docker 走阿里云源，可选传镜像加速器地址）
sudo bash scripts/deploy/setup-server.sh [https://<你的ID>.mirror.aliyuncs.com]

# 2. 克隆代码并生成生产 .env（随机强密钥 + 数据目录）
git clone https://github.com/puppyfront-web/ai-growth-ops.git && cd ai-growth-ops
bash scripts/deploy/init-env.sh

# 3.（可选）只做环境预检，不改系统
bash scripts/deploy/deploy.sh --check

# 4. 部署：构建镜像 → 启动基础设施 → 迁移+初始化 → 全量启动 → 健康检查
bash scripts/deploy/deploy.sh

# 日常更新
bash scripts/deploy/update.sh
```

安全组不要放行 3000/3100/3200 等端口；远程访问走 SSH 隧道
（`ssh -L 3001:127.0.0.1:3001 <user>@<服务器IP>`）。脚本细节见 `scripts/deploy/` 内注释。

## GitHub Actions 自动部署（CI/CD）

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) 在每次 push 到 `main`（或手动 `workflow_dispatch`）时执行：

1. **构建推送**：用 Buildx 并行构建 api / web / worker / browser-runner 四个镜像，打上 `commit-sha` 与 `latest` 两个 tag，推送到阿里云容器镜像服务 ACR（带 GitHub Actions 缓存）。
2. **SSH 部署**：把 `docker-compose.prod.yml` 和 `scripts/deploy/server-deploy.sh` 同步到服务器 `DEPLOY_DIR`（默认 `/srv/ai-growth-ops`），执行服务器端部署：
   - 自动创建 `LOCAL_DATA_DIR` 目录结构（0700）；
   - 拉取本次 tag 的镜像；
   - 启动 PostgreSQL / Redis / MinIO 并等待健康；
   - **自动创建数据库**（兜底 `CREATE DATABASE`，首次启动由 `POSTGRES_DB` 自动建库）；
   - 容器内执行 `prisma migrate deploy`；空库时自动 seed 管理员；
   - 滚动重启全部服务并做健康检查（API `/health`、Web `/login`）。

服务器上的 `.env` 只在**缺失时**由 GitHub Secrets 引导生成，之后每次部署都保留服务器既有配置——`TOKEN_ENCRYPTION_KEY` 等密钥一旦生成不可更换。ACR 登录凭据通过一次性文件 `.deploy-credentials` 下发，部署结束（无论成败）都会删除。

### 前置条件

1. **开通 ACR**：容器镜像服务（个人版即可）→ 创建命名空间（如 `myteam`），记下访问域名（如 `registry.cn-hangzhou.aliyuncs.com`）与登录凭据。仓库会在首次 push 时自动创建。
2. **ECS 安装 Docker**：`sudo bash scripts/deploy/setup-server.sh`（一次性）。
3. **ECS 安全组放行 22 端口**给 GitHub Actions Runner（公网 SSH；建议仅在 CI 时段放行或使用固定出口的自托管 Runner）。
4. 服务器无需克隆代码，也无需 Node/pnpm。

### 所需 GitHub Secrets

仓库 Settings → Secrets and variables → Actions 中配置：

| Secret | 说明 |
| --- | --- |
| `ACR_REGISTRY_HOST` | ACR 域名，如 `registry.cn-hangzhou.aliyuncs.com` |
| `ACR_NAMESPACE` | ACR 命名空间 |
| `ACR_USERNAME` / `ACR_PASSWORD` | ACR 登录凭据（CI 推镜像 + 服务器拉镜像） |
| `ECS_HOST` / `ECS_USER` | 服务器 IP 与 SSH 用户 |
| `ECS_SSH_KEY` | 私钥 PEM 全文（公钥放入服务器 `~/.ssh/authorized_keys`） |
| `ECS_DEPLOY_DIR` | 可选，部署目录，默认 `/srv/ai-growth-ops` |
| `AUTH_SECRET` / `TOKEN_ENCRYPTION_KEY` / `INTERNAL_API_SECRET` / `BROWSER_RUNNER_SECRET` | 服务密钥（`openssl rand -hex 32`；首次部署引导 .env 时使用） |
| `POSTGRES_PASSWORD` / `MINIO_ROOT_PASSWORD` | 数据库与对象存储密码 |
| `ADMIN_PASSWORD`（可选 `ADMIN_EMAIL`/`ADMIN_NAME`） | 首次 seed 的管理员 |
| `APP_URL` | 对外访问地址，如 `https://yourdomain.com` |
| `OPENAI_API_KEY`、`VISION_API_KEY`、`RESEND_API_KEY` 等 | 可选；配置了才会写入 .env |

### 日常发布与回滚

- **发布**：合并到 `main` 即自动发布；工作流自带并发队列，不会并行部署。
- **手动重发**：Actions 页面 Run workflow。
- **回滚**：旧 tag（commit sha）镜像仍保留在 ACR，SSH 到服务器执行：
  `cd /srv/ai-growth-ops && IMAGE_TAG=<旧sha> bash scripts/deploy/server-deploy.sh`
  数据库结构变更的回滚请先按「备份、恢复与回滚」恢复数据。

### 域名与 nginx（可选，一次性）

CI 部署**不会**修改 nginx：web/API 只绑定服务器回环地址的固定端口（web `127.0.0.1:${WEB_PORT:-3002}`、API `3100`），发布替换的是端口后面的容器，nginx 无感知。域名接入是纯一次性操作：

1. DNS 给域名加 A 记录指向服务器 IP；
2. 用模板生成 vhost（`/api`、`/uploads` 由 Next.js 服务端 rewrite 到 API 容器，nginx 只需转发 web）：
   `sed "s/__DOMAIN__/<你的域名>/" scripts/deploy/nginx-vhost.conf.example | sudo tee /etc/nginx/conf.d/<你的域名>.conf`
   然后 `sudo nginx -t && sudo systemctl reload nginx`；
3. 更新 `APP_URL`（GitHub Secret 与服务器 `/srv/ai-growth-ops/.env` 中的值）为 `http://<你的域名>`，下一次部署或 `docker compose -f docker-compose.prod.yml up -d` 生效。

模板已含 SSE 流式响应的长超时与 100m 上传限制。生产启用 HTTPS：安装 certbot 后执行
`certbot --nginx -d <域名> --redirect` 并 `systemctl enable --now certbot-renew.timer`（ALinux3
如遇 pyOpenSSL 报错先 `pip3 install --upgrade pyopenssl`），命令细节见模板文件头注释。
启用后把 GitHub Secrets 与服务器 `.env` 的 `APP_URL` 更新为 `https://<域名>`。

## 构建与启动（手动方式）

```sh
pnpm install --frozen-lockfile
pnpm verify:release
pnpm local:prepare
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d postgres redis minio
docker compose -f docker-compose.prod.yml run --rm api pnpm db:deploy
docker compose -f docker-compose.prod.yml run --rm api pnpm db:seed
docker compose -f docker-compose.prod.yml up -d
```

已有凭据迁移到用户本地目录时，先备份数据库和 `LOCAL_DATA_DIR`，再执行：

```sh
pnpm secrets:migrate-local
pnpm secrets:migrate-local --apply
```

数据库只能用 `prisma migrate deploy`。禁止在生产运行 `db push`、`db:reset:test` 或 `migrate reset`。已有数据库升级前执行 [数据库升级流程](./delivery/database-upgrade.md)。

## 本机访问与健康检查

Compose 仅把 Web 与 API 绑定在宿主机回环地址，不通过反向代理暴露公网。

```sh
curl --fail http://127.0.0.1:3100/health
curl --fail http://127.0.0.1:3000/login
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 api worker browser-runner
```

PostgreSQL、Redis、MinIO 和 Browser Runner 不对公网开放。需要查看 MinIO 控制台时使用 SSH 隧道或临时、受控的回环端口映射。

## 备份、恢复与回滚

发布前至少完成一次一致性备份：

```sh
pnpm local:backup
```

恢复必须先在隔离目录验证：

```sh
pnpm local:restore -- /absolute/path/to/backup --confirm
```

使用同一 `TOKEN_ENCRYPTION_KEY` 启动后，核对客户、线索、发布记录、素材和一条加密凭据。`.env` 和密钥需要单独安全备份，不能只保留数据归档。
