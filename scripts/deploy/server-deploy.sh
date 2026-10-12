#!/usr/bin/env bash
# =============================================================
# AI Growth Ops — CI 触发的服务器端部署
# 由 .github/workflows/deploy.yml 通过 SSH 在 $DEPLOY_DIR 下调用；
# 也可手动运行：IMAGE_TAG=<tag> bash scripts/deploy/server-deploy.sh
# 流程：准备数据目录 → 拉取 ACR 镜像 → 启动基础设施 → 确保数据库存在
#       → 容器内迁移 → 空库自动 seed → 滚动重启 → 健康检查
# 依赖：目录下已有 .env（首次由 CI 从 GitHub Secrets 引导生成，
#       或手动运行 scripts/deploy/init-env.sh 生成）。
# =============================================================
set -euo pipefail

cd "$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE="docker compose -f docker-compose.prod.yml"

green() { printf '\033[0;32m✔ %s\033[0m\n' "$1"; }
red() { printf '\033[0;31m✖ %s\033[0m\n' "$1"; }
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

# ── 0. 载入配置 ─────────────────────────────────────────────
[ -f .env ] || { red "缺少 .env（首次部署由 CI 引导生成，或运行 scripts/deploy/init-env.sh）"; exit 1; }
# shellcheck disable=SC1091
set -a; source .env; set +a
# CI 注入的一次性凭据（ACR 登录 + 本次镜像 tag），部署结束自动删除
if [ -f .deploy-credentials ]; then
  # shellcheck disable=SC1091
  set -a; source .deploy-credentials; set +a
fi
IMAGE_TAG="${IMAGE_TAG:-latest}"
export IMAGE_TAG
DATA_ROOT="${LOCAL_DATA_DIR:?请在 .env 中设置 LOCAL_DATA_DIR（绝对路径）}"
# 国内 ECS 直连 Docker Hub 不可靠：CI 已把基础镜像中转到 ACR，这里指向中转地址
if [ -n "${REGISTRY:-}" ]; then
  export POSTGRES_IMAGE="${REGISTRY}/postgres:16-alpine"
  export REDIS_IMAGE="${REGISTRY}/redis:7-alpine"
  export MINIO_IMAGE="${REGISTRY}/minio:RELEASE.2025-09-07T16-13-09Z"
fi

cleanup() { rm -f .deploy-credentials; }
trap cleanup EXIT

# ── 1. 数据目录 ─────────────────────────────────────────────
step "1/8 准备数据目录"
[ "${DATA_ROOT:0:1}" = "/" ] || { red "LOCAL_DATA_DIR 必须是绝对路径：$DATA_ROOT"; exit 1; }
for dir in postgres redis objects secrets uploads backups; do
  install -d -m 0700 "$DATA_ROOT/$dir"
done
chmod 0700 "$DATA_ROOT"
green "目录结构就绪（0700）：$DATA_ROOT"

# ── 2. 配置校验 ─────────────────────────────────────────────
step "2/8 Compose 配置校验"
$COMPOSE config --quiet && green "docker-compose.prod.yml 渲染通过"

# ── 3. 登录 ACR 并拉取镜像 ──────────────────────────────────
step "3/8 拉取镜像（tag=$IMAGE_TAG）"
if [ -n "${ACR_PASSWORD:-}" ]; then
  REGISTRY_HOST="${REGISTRY_HOST:-${REGISTRY%%/*}}"
  echo "$ACR_PASSWORD" | docker login "$REGISTRY_HOST" -u "${ACR_USERNAME:?缺少 ACR_USERNAME}" --password-stdin
  green "已登录 $REGISTRY_HOST"
fi
if [ -n "${REGISTRY:-}" ]; then
  $COMPOSE pull api web worker browser-runner
else
  echo "未设置 REGISTRY，跳过拉取，使用本地已有镜像（先运行 scripts/deploy/deploy.sh 构建）"
fi

# ── 4. 启动基础设施 ─────────────────────────────────────────
step "4/8 启动 PostgreSQL / Redis / MinIO"
$COMPOSE up -d postgres redis minio
for i in $(seq 1 30); do
  if [ "$($COMPOSE ps --format json postgres | grep -c healthy)" -ge 1 ]; then
    break
  fi
  sleep 2
done
$COMPOSE ps postgres | grep -q healthy || { red "postgres 未就绪，查看日志：$COMPOSE logs postgres"; exit 1; }
green "基础设施健康"

# ── 5. 确保数据库存在 ───────────────────────────────────────
POSTGRES_DB="${POSTGRES_DB:-ai_growth_ops}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
step "5/8 确保数据库存在（$POSTGRES_DB）"
# 首次启动时 POSTGRES_DB 会自动建库；此处兜底处理改过库名/挂了旧数据卷的情况
if [ "$($COMPOSE exec -T postgres psql -U "$POSTGRES_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'" | tr -d '[:space:]')" = "1" ]; then
  green "数据库已存在"
else
  $COMPOSE exec -T postgres psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$POSTGRES_DB\""
  green "已创建数据库 $POSTGRES_DB"
fi

# ── 6. 迁移前数据库备份 ─────────────────────────────────────
step "6/9 迁移前数据库备份（失败即中止）"
mkdir -p "$DATA_ROOT/backups"
$COMPOSE exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip > "$DATA_ROOT/backups/pre-migrate-${IMAGE_TAG}.sql.gz"
ls -1t "$DATA_ROOT/backups"/pre-migrate-*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
green "已备份（保留最近 10 份）：backups/pre-migrate-${IMAGE_TAG}.sql.gz"

# ── 7. 迁移 + 空库初始化管理员 ──────────────────────────────
step "7/9 数据库迁移 + 空库自动 seed"
$COMPOSE run --rm -T api pnpm db:deploy
if [ "$($COMPOSE exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
  "SELECT count(*) FROM \"User\"" 2>/dev/null | tr -d '[:space:]')" = "0" ]; then
  $COMPOSE run --rm -T api pnpm db:seed
  green "已自动创建管理员（见 .env 的 ADMIN_EMAIL / ADMIN_PASSWORD）"
else
  green "已有用户，跳过 seed"
fi

# ── 8. 滚动更新全部服务 ─────────────────────────────────────
step "8/9 滚动更新全部服务"
$COMPOSE up -d
# 清理悬挂层与旧版本镜像（保留当前 tag 与 latest），防止 ECS 磁盘被历史镜像占满
docker image prune -f >/dev/null 2>&1 || true
if [ -n "${REGISTRY:-}" ]; then
  docker images --format '{{.Repository}}:{{.Tag}}' \
    | grep "^${REGISTRY}/ai-growth-ops-" \
    | grep -v ":${IMAGE_TAG}$" | grep -v ":latest$" \
    | xargs -r docker rmi >/dev/null 2>&1 || true
fi
green "容器已按镜像 tag=$IMAGE_TAG 重建"

# ── 9. 健康检查 ─────────────────────────────────────────────
step "9/9 健康检查"
API_PORT="${API_PORT:-3100}"
WEB_PORT="${WEB_PORT:-3000}"
ok=""
for i in $(seq 1 45); do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" | grep -q '"status":"ok"'; then
    ok=1; break
  fi
  sleep 4
done
if [ -z "$ok" ]; then
  red "API 未在预期时间内达到 ok。排查："
  echo "  $COMPOSE ps"
  echo "  $COMPOSE logs --tail=100 api worker"
  exit 1
fi
if curl -sf -o /dev/null "http://127.0.0.1:${WEB_PORT}/login"; then
  green "Web 登录页可访问"
else
  red "Web 登录页不可访问，排查：$COMPOSE logs --tail=100 web"
  exit 1
fi
green "部署完成：镜像 tag=$IMAGE_TAG"
