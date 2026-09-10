#!/usr/bin/env bash
# =============================================================
# AI Growth Ops — 一键启动脚本
# 用法: ./start.sh
# 停止: ./stop.sh
# =============================================================
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/.logs"
mkdir -p "$LOG_DIR"

# ── 颜色 ─────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✔ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
fail() { echo -e "${RED}✖ $1${NC}"; }

API_PORT="${API_PORT:-3100}"
WEB_PORT="${WEB_PORT:-3001}"
BROWSER_RUNNER_PORT="${BROWSER_RUNNER_PORT:-3200}"
TSX="$ROOT/node_modules/.bin/tsx"
ENV_FILE="$ROOT/.env"

echo ""
echo "=================================================="
echo "  AI Growth Ops — 启动中"
echo "=================================================="
echo ""

# ── 加载环境变量 ──────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  fail ".env 文件不存在，请先复制 .env.example 并填写配置"
  exit 1
fi
set -a && source "$ENV_FILE" && set +a

if [ ! -x "$TSX" ]; then
  fail "未找到 tsx，请先运行 pnpm install"
  exit 1
fi

# ── 1. Docker 基础服务 ────────────────────────────────────────
echo "► 检查 Docker 基础服务 (Postgres / Redis / MinIO)..."
if ! docker compose -f "$ROOT/docker-compose.yml" ps --status running 2>/dev/null | grep -qE 'postgres|redis'; then
  echo "  正在启动 Docker 服务..."
  docker compose -f "$ROOT/docker-compose.yml" up -d
  echo "  等待数据库就绪..."
  sleep 5
fi
ok "Docker 基础服务运行中"

# ── 2. 数据库迁移 ─────────────────────────────────────────────
echo "► 执行数据库迁移..."
cd "$ROOT"
if ! pnpm db:deploy > "$LOG_DIR/migrate.log" 2>&1; then
  fail "数据库迁移失败，请查看 $LOG_DIR/migrate.log"
  echo "  若 _prisma_migrations 有重复记录，可运行: node scripts/prune-migration-ghosts.mjs"
  exit 1
fi
ok "数据库迁移完成"

echo "► 生成 Prisma Client..."
if ! pnpm --filter @ai-growth-ops/database exec prisma generate --schema prisma/schema.prisma >> "$LOG_DIR/migrate.log" 2>&1; then
  fail "Prisma Client 生成失败，请检查 $LOG_DIR/migrate.log"
  exit 1
fi
ok "Prisma Client 已更新"

# ── 3. 停止已有应用进程 ───────────────────────────────────────
echo "► 停止旧进程..."
"$ROOT/stop.sh" > /dev/null 2>&1 || true
sleep 2

# ── 4. 启动各服务（setsid 脱离终端，避免脚本退出后进程被杀）────
launch() {
  local name=$1
  shift
  : > "$LOG_DIR/$name.log"
  nohup "$@" >> "$LOG_DIR/$name.log" 2>&1 &
  local pid=$!
  disown -h "$pid" 2>/dev/null || true
  echo "$pid" > "$LOG_DIR/$name.pid"
}

echo "► 启动 API 服务 (端口 ${API_PORT})..."
launch api "$TSX" --env-file="$ENV_FILE" "$ROOT/apps/api/src/server.ts"

echo "► 启动 Worker 服务..."
launch worker "$TSX" --env-file="$ENV_FILE" "$ROOT/apps/worker/src/index.ts"

echo "► 启动 Browser Runner 服务 (端口 ${BROWSER_RUNNER_PORT})..."
launch browser-runner "$TSX" --env-file="$ENV_FILE" "$ROOT/apps/browser-runner/src/server.ts"

echo "► 启动 Web 前端 (端口 ${WEB_PORT})..."
launch web pnpm --filter @ai-growth-ops/web dev

record_listener_pid() {
  local name=$1 port=$2
  local pid=""
  for _ in $(seq 1 15); do
    pid=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)
    [ -n "$pid" ] && break
    sleep 1
  done
  if [ -n "$pid" ]; then
    echo "$pid" > "$LOG_DIR/$name.pid"
  fi
}

# ── 5. 等待服务就绪 ───────────────────────────────────────────
echo ""
echo "► 等待服务启动 (最多 90 秒)..."

wait_for() {
  local name=$1 url=$2 max=$3 i=0
  while [ $i -lt $max ]; do
    if curl -sf "$url" -o /dev/null 2>/dev/null; then
      ok "$name 已就绪"
      return 0
    fi
    sleep 2
    i=$((i+2))
  done
  warn "$name 启动超时，请检查日志: $LOG_DIR/${name}.log"
  return 1
}

wait_for "api"            "http://127.0.0.1:${API_PORT}/health" 60
record_listener_pid api "$API_PORT"

wait_for "browser-runner" "http://127.0.0.1:${BROWSER_RUNNER_PORT}/health" 60
record_listener_pid browser-runner "$BROWSER_RUNNER_PORT"

wait_for "web"            "http://127.0.0.1:${WEB_PORT}" 90
record_listener_pid web "$WEB_PORT"

# ── 6. 完成 ───────────────────────────────────────────────────
echo ""
echo "=================================================="
ok "所有服务启动完成！"
echo ""
echo "  🌐 前端界面:     http://127.0.0.1:${WEB_PORT}"
echo "  🔌 API:          http://127.0.0.1:${API_PORT}"
echo "  🤖 浏览器执行器: http://127.0.0.1:${BROWSER_RUNNER_PORT}"
echo ""
echo "  📋 日志目录:     $LOG_DIR/"
echo "  🛑 停止所有服务: ./stop.sh"
echo "=================================================="
echo ""
