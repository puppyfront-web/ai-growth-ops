# 部署指南

## 一键部署 (Docker Compose)

### 1. 准备服务器

- Ubuntu 22.04+ / macOS
- Docker 24+ & Docker Compose v2
- 最低 4GB RAM, 2 CPU

### 2. 克隆仓库

```bash
git clone <repo-url> /opt/ai-growth-ops
cd /opt/ai-growth-ops
```

### 3. 配置环境变量

```bash
cp .env.template .env
```

必须修改的变量:

```env
POSTGRES_PASSWORD=<strong-password>
AUTH_SECRET=<random-32-char-secret>
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxx
EMAIL_FROM="AI Growth Ops <noreply@yourdomain.com>"
APP_URL=https://yourdomain.com
NEXT_PUBLIC_API_URL=https://yourdomain.com/api
```

### 4. 构建并启动

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 5. 初始化数据库

```bash
docker compose -f docker-compose.prod.yml exec api npx prisma db push
```

### 6. 验证部署

```bash
curl http://localhost:3100/health
# 应返回 {"status":"ok","checks":{"database":{"status":"ok"},...}}
```

## SSL 配置 (Nginx 反向代理)

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/ssl/yourdomain.crt;
    ssl_certificate_key /etc/ssl/yourdomain.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 备份策略

### PostgreSQL 备份

```bash
# 每日备份
docker compose exec postgres pg_dump -U postgres ai_growth_ops > backup_$(date +%Y%m%d).sql

# 自动备份 (cron)
0 3 * * * docker compose -f /opt/ai-growth-ops/docker-compose.prod.yml exec -T postgres pg_dump -U postgres ai_growth_ops | gzip > /backup/db_$(date +\%Y\%m\%d).sql.gz
```

### 恢复

```bash
gunzip -c /backup/db_20260601.sql.gz | docker compose exec -T postgres psql -U postgres ai_growth_ops
```

## 常见问题

### 服务无法启动

1. 检查 `.env` 配置是否正确
2. 检查端口是否被占用: `ss -tlnp | grep -E '3000|3100|5432|6379'`
3. 查看日志: `docker compose logs api`

### 数据库连接失败

1. 确认 postgres 容器健康: `docker compose ps postgres`
2. 检查 DATABASE_URL 格式: `postgresql://user:pass@postgres:5432/dbname`
3. 进入 postgres 容器测试: `docker compose exec postgres psql -U postgres`

### Worker 任务不执行

1. 确认 redis 连接正常
2. 检查 worker 日志: `docker compose logs worker`
3. 确认 BullMQ 队列: `docker compose exec redis redis-cli LLEN bull:publish.execute`
