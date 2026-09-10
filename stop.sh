#!/usr/bin/env bash
# =============================================================
# AI Growth Ops — 停止所有服务
# =============================================================
ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/.logs"

GREEN='\033[0;32m'; NC='\033[0m'
ok() { echo -e "${GREEN}✔ $1${NC}"; }

echo "► 停止 AI Growth Ops 服务..."

# 按端口停止（最可靠）
for port in 3100 3001 3200; do
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null && ok "端口 $port (PID $pids) 已停止" || true
  fi
done

for svc in api worker browser-runner web; do
  pid_file="$LOG_DIR/$svc.pid"
  if [ -f "$pid_file" ]; then
    pid=$(cat "$pid_file")
    kill "$pid" 2>/dev/null && ok "$svc (PID $pid) 已停止" || true
    rm -f "$pid_file"
  fi
done

# 兜底：清理所有 monorepo 子进程（含旧 session 遗留的 worker）
pkill -f "ai-growth-ops/apps/" 2>/dev/null || true
pkill -f "@ai-growth-ops/(api|worker|web|browser-runner)" 2>/dev/null || true
pkill -f "tsx.*apps/(api|worker|browser-runner)/src" 2>/dev/null || true

ok "所有服务已停止"
