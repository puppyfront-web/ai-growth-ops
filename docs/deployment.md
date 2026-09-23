# 部署指南

当前容器部署面向单机受控试用或小团队生产环境。正式启用真实平台发布前，还必须完成 [交付规范](./delivery/crm-release-spec.md) 中的真实平台与恢复验收。

## 环境与密钥

服务器建议 Ubuntu 22.04+、Docker 24+、Docker Compose v2、至少 4 GB 内存和 2 CPU。复制模板并填写配置：

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
APP_URL=https://yourdomain.com
```

`TOKEN_ENCRYPTION_KEY` 用于解密已保存的平台和模型凭据，备份后不得随意更换。API、Web 及 Browser Runner 的内部地址由生产 Compose 固定为容器服务名。

## 构建与启动

```sh
pnpm install --frozen-lockfile
pnpm verify:release
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d postgres redis minio
docker compose -f docker-compose.prod.yml run --rm api pnpm db:deploy
docker compose -f docker-compose.prod.yml run --rm api pnpm db:seed
docker compose -f docker-compose.prod.yml up -d
```

数据库只能用 `prisma migrate deploy`。禁止在生产运行 `db push`、`db:reset:test` 或 `migrate reset`。已有数据库升级前执行 [数据库升级流程](./delivery/database-upgrade.md)。

## 反向代理与健康检查

Compose 仅把 Web 与 API 绑定在宿主机回环地址。Nginx 示例：

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/ssl/yourdomain.crt;
    ssl_certificate_key /etc/ssl/yourdomain.key;

    location /api/ {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```sh
curl --fail http://127.0.0.1:3100/health
curl --fail http://127.0.0.1:3000/login
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 api worker browser-runner
```

PostgreSQL、Redis、MinIO 和 Browser Runner 不对公网开放。需要查看 MinIO 控制台时使用 SSH 隧道或临时、受控的回环端口映射。

## 备份、恢复与回滚

每天备份 PostgreSQL、上传文件和 `.env` 中的加密密钥，并把备份放到应用服务器之外：

```sh
docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > ai-growth-ops.sql.gz
```

恢复必须先在隔离环境验证：新建空数据库，导入备份，使用同一 `TOKEN_ENCRYPTION_KEY` 启动，核对客户、线索、发布记录、平台账号和一条加密凭据，再演练 Worker 重启恢复。代码回滚不能反向猜测数据库结构；涉及迁移时按升级文档准备专门回滚 SQL 或恢复快照。
