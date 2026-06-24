#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# AI Growth Ops — 一键启动本地开发环境
#
# 启动:PostgreSQL + Redis + MinIO(docker) → 数据库迁移/seed
#      → api(3100) + web(3001) + worker + browser-runner(3200)
#
# 用法:  ./scripts/dev.sh
# 停止:  ./scripts/stop.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"
PIDS=()

cleanup() {
  echo ""
  echo "[dev] 正在停止应用进程(worker/api/web/browser-runner)…"
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  # 兜底:按端口清理(不碰 docker)
  for port in 3100 3001 3200; do
    local_pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    [ -n "$local_pids" ] && kill $local_pids 2>/dev/null || true
  done
  echo "[dev] 应用已停止。Postgres/Redis/MinIO 容器仍在运行(由 docker 管理)。"
  echo "[dev] 如需关闭容器:docker compose down"
}
trap cleanup EXIT INT TERM

# ── 前置检查 ─────────────────────────────────────────────────
echo "[dev] 检查依赖…"
command -v node >/dev/null || { echo "✗ 未安装 Node.js(需要 v24+)"; exit 1; }
command -v pnpm >/dev/null || { echo "✗ 未安装 pnpm: npm i -g pnpm"; exit 1; }
command -v docker >/dev/null || { echo "✗ 未安装 Docker"; exit 1; }

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "✗ Node.js 版本过低(当前 $(node -v),需要 v20+ 推荐 v24)"
  exit 1
fi

# ── .env ─────────────────────────────────────────────────────
if [ ! -f "$ROOT/.env" ]; then
  echo "[dev] 未发现 .env,从 .env.example 复制…"
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "[dev] ⚠️  请编辑 .env 填入 OPENAI_API_KEY 等真实值后重新运行。"
  echo "[dev]    (本地开发可暂时用占位值跑通基础功能,AI 相关能力需真实 key)"
fi

# ── docker 基础设施 ──────────────────────────────────────────
echo "[dev] 启动 Postgres / Redis / MinIO…"
docker compose up -d postgres redis minio

echo "[dev] 等待 Postgres 就绪…"
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    echo "[dev] Postgres 就绪。"
    break
  fi
  sleep 1
  [ "$i" -eq 30 ] && { echo "✗ Postgres 30 秒内未就绪"; exit 1; }
done

# ── 依赖 ─────────────────────────────────────────────────────
if [ ! -d "$ROOT/node_modules" ]; then
  echo "[dev] 安装依赖…"
  pnpm install
fi

# ── 数据库 ───────────────────────────────────────────────────
echo "[dev] 生成 Prisma client + 迁移数据库…"
pnpm db:generate
pnpm db:migrate || {
  echo "[dev] migrate 失败,尝试 db:push…"
  pnpm db:push
}

echo "[dev] 执行 seed(创建默认 admin 账号)…"
pnpm db:seed || echo "[dev] seed 跳过(可能已存在)"

# ── 启动应用服务 ─────────────────────────────────────────────
export BROWSER_RUNNER_HEADED="${BROWSER_RUNNER_HEADED:-true}"

echo "[dev] 启动 API (3100)…"
nohup ./node_modules/.bin/tsx --env-file=.env apps/api/src/server.ts > "$LOG_DIR/api.log" 2>&1 &
PIDS+=($!)

echo "[dev] 启动 Worker…"
nohup ./node_modules/.bin/tsx --env-file=.env apps/worker/src/index.ts > "$LOG_DIR/worker.log" 2>&1 &
PIDS+=($!)

echo "[dev] 启动 Browser Runner (3200, headed=$BROWSER_RUNNER_HEADED)…"
nohup ./node_modules/.bin/tsx --env-file=.env apps/browser-runner/src/server.ts > "$LOG_DIR/browser-runner.log" 2>&1 &
PIDS+=($!)

echo "[dev] 启动 Web (3001)…"
nohup ./node_modules/.bin/pnpm --filter @ai-growth-ops/web dev > "$LOG_DIR/web.log" 2>&1 &
PIDS+=($!)

# ── 等待服务就绪 ─────────────────────────────────────────────
echo "[dev] 等待 API 就绪…"
for i in $(seq 1 30); do
  curl -sf http://localhost:3100/api/health >/dev/null 2>&1 && break
  sleep 1
done

cat <<'BANNER'

╔══════════════════════════════════════════════════════════╗
║   ✅ AI Growth Ops 已启动                                ║
╠══════════════════════════════════════════════════════════╣
║   前端:    http://localhost:3001                         ║
║   API:      http://localhost:3100                         ║
║   账号:     admin@ai-growth-ops.local                     ║
║   密码:     changeme123                                   ║
║   日志:     .dev-logs/{api,web,worker,browser-runner}.log ║
║                                                          ║
║   按 Ctrl+C 停止所有服务                                  ║
╚══════════════════════════════════════════════════════════╝
BANNER

# 保持前台运行,直到 Ctrl+C
wait
