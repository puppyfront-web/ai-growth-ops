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

## 构建与启动

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
