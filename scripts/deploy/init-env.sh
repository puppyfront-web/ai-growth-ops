#!/usr/bin/env bash
# =============================================================
# AI Growth Ops — 生成生产 .env（在仓库根目录运行）
# 用途：生成全部必填强密钥与路径配置，产出 600 权限的 .env。
# 已存在 .env 时拒绝覆盖（--force 可先备份再重建）。
# =============================================================
set -euo pipefail

cd "$(cd "$(dirname "$0")/../.." && pwd)"

green() { printf '\033[0;32m✔ %s\033[0m\n' "$1"; }
red() { printf '\033[0;31m✖ %s\033[0m\n' "$1"; }

if [ -f .env ] && [ "${1:-}" != "--force" ]; then
  red ".env 已存在；确认重建请运行：bash scripts/deploy/init-env.sh --force（旧文件会备份）"
  exit 1
fi
if [ -f .env ]; then
  cp .env ".env.bak.$(date +%Y%m%d%H%M%S)"
  green "旧 .env 已备份"
fi

hex32() { openssl rand -hex 32; }

ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
DATA_DIR="${LOCAL_DATA_DIR:-/srv/ai-growth-ops/data}"
APP_URL="${APP_URL:-http://127.0.0.1:3001}"

cat > .env <<EOF
# ══ AI Growth Ops 生产配置（由 init-env.sh 生成于 $(date '+%F %T')）══
# 本文件包含密钥，权限必须保持 600；备份时与 LOCAL_DATA_DIR 一起保存。

# ── 数据目录（全部业务数据的根，务必用绝对路径）──
LOCAL_DATA_DIR=$DATA_DIR

# ── 数据库与对象存储 ──
POSTGRES_DB=ai_growth_ops
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$(hex32)
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=$(hex32)

# ── 服务密钥（openssl rand -hex 32）──
AUTH_SECRET=$(hex32)
TOKEN_ENCRYPTION_KEY=$(hex32)
INTERNAL_API_SECRET=$(hex32)
BROWSER_RUNNER_SECRET=$(hex32)

# ── 管理员（首次 seed 使用，登录后立即修改密码）──
ADMIN_EMAIL=admin@ai-growth-ops.local
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_NAME=Admin

# ── 访问地址（对外提供域名时改为 https://yourdomain.com）──
APP_URL=$APP_URL

# ── 端口（默认 Web=3000 API=3100，仅绑定 127.0.0.1；如遇冲突可改）──
# WEB_PORT=3000
# API_PORT=3100
EOF
chmod 600 .env

green ".env 已生成（600 权限）"
echo ""
echo "  数据目录：$DATA_DIR"
echo "  管理员：  admin@ai-growth-ops.local / $ADMIN_PASSWORD"
echo ""
echo "⚠ 管理员密码只显示这一次；TOKEN_ENCRYPTION_KEY 丢失将无法解密已保存的凭据，"
echo "  请把 .env 与 LOCAL_DATA_DIR 一并纳入离机备份。"
