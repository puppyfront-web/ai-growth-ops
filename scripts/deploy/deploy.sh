#!/usr/bin/env bash
# =============================================================
# AI Growth Ops — 首次部署（在服务器的仓库根目录运行）
# 前置：setup-server.sh 已装好 Docker；init-env.sh 已生成 .env
# 用法：bash scripts/deploy/deploy.sh          # 完整部署
#       bash scripts/deploy/deploy.sh --check  # 只做预检和配置校验
# 服务器无需 Node/pnpm：构建、迁移、seed 全部在容器内完成。
# =============================================================
set -euo pipefail

cd "$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE="docker compose -f docker-compose.prod.yml"
CHECK_ONLY="${1:-}"

green() { printf '\033[0;32m✔ %s\033[0m\n' "$1"; }
red() { printf '\033[0;31m✖ %s\033[0m\n' "$1"; }
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

# ── 1. 预检 ─────────────────────────────────────────────────
step "1/7 环境预检"
command -v docker >/dev/null || { red "未安装 Docker，先运行 scripts/deploy/setup-server.sh"; exit 1; }
docker compose version >/dev/null 2>&1 || { red "缺少 docker compose 插件"; exit 1; }
[ -f .env ] || { red "缺少 .env，先运行 scripts/deploy/init-env.sh"; exit 1; }
# shellcheck disable=SC1091
set -a; source .env; set +a
: "${LOCAL_DATA_DIR:?请在 .env 中设置 LOCAL_DATA_DIR（绝对路径）}"
[ "${LOCAL_DATA_DIR:0:1}" = "/" ] || { red "LOCAL_DATA_DIR 必须是绝对路径：$LOCAL_DATA_DIR"; exit 1; }
green "Docker / Compose / .env 就绪，数据目录 $LOCAL_DATA_DIR"

# ── 2. 数据目录 ─────────────────────────────────────────────
step "2/7 准备数据目录"
if [ "$CHECK_ONLY" = "--check" ]; then
  echo "（--check 模式跳过写入）"
else
  for dir in postgres redis objects secrets uploads backups; do
    install -d -m 0700 "$LOCAL_DATA_DIR/$dir"
  done
  chmod 0700 "$LOCAL_DATA_DIR"
  green "目录结构就绪（0700）"
fi

# ── 3. 配置校验 ─────────────────────────────────────────────
step "3/7 Compose 配置校验"
$COMPOSE config --quiet && green "docker-compose.prod.yml 渲染通过" || { red "配置校验失败"; exit 1; }
if [ "$CHECK_ONLY" = "--check" ]; then
  green "--check 完成：环境满足部署条件"
  exit 0
fi

# ── 4. 构建镜像 ─────────────────────────────────────────────
step "4/7 构建镜像（首次约 5-15 分钟）"
$COMPOSE build

# ── 5. 基础设施 ─────────────────────────────────────────────
step "5/7 启动 PostgreSQL / Redis / MinIO"
$COMPOSE up -d postgres redis minio
for i in $(seq 1 30); do
  if [ "$($COMPOSE ps --format json postgres | grep -c healthy)" -ge 1 ]; then
    break
  fi
  sleep 2
done
$COMPOSE ps postgres | grep -q healthy || { red "postgres 未就绪，查看日志：$COMPOSE logs postgres"; exit 1; }
green "基础设施健康"

# ── 6. 数据库迁移与初始化 ───────────────────────────────────
step "6/7 数据库迁移 + 初始化管理员"
$COMPOSE run --rm api pnpm db:deploy
if [ "$($COMPOSE exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM \"User\"" 2>/dev/null | tr -d '[:space:]')" = "0" ]; then
  $COMPOSE run --rm api pnpm db:seed
  green "已创建管理员（见 .env 的 ADMIN_EMAIL / ADMIN_PASSWORD）"
else
  green "已有用户，跳过 seed"
fi

# ── 7. 启动全部服务 ─────────────────────────────────────────
step "7/7 启动并等待健康检查"
$COMPOSE up -d
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
  red "API 未在预期时间内达到 ok（可能仍为 degraded，容器仍在重试）。排查："
  echo "  $COMPOSE ps"
  echo "  $COMPOSE logs --tail=100 api worker"
  exit 1
fi
curl -sf -o /dev/null "http://127.0.0.1:${WEB_PORT}/login" && green "Web 登录页可访问"

echo ""
green "部署完成 🎉"
echo ""
echo "  本机访问：  http://127.0.0.1:${WEB_PORT}（服务器上）"
echo "  远程访问：  ssh -L 3001:127.0.0.1:${WEB_PORT} <user>@<服务器IP> 后打开 http://127.0.0.1:3001"
echo "  日志：      $COMPOSE logs -f api worker"
echo "  备份：      node scripts/backup-local-data.mjs（或参照 docs/deployment.md）"
echo "  更新版本：  bash scripts/deploy/update.sh"
echo ""
echo "⚠ 首次登录后立即修改管理员密码；安全组不要放行 3000/3100 端口。"
