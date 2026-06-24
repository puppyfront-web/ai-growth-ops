#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# AI Growth Ops — 停止本地应用服务
# 停止 api / web / worker / browser-runner,不影响 docker 容器。
# 用法:  ./scripts/stop.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

echo "[stop] 停止应用进程(api/web/worker/browser-runner)…"
stopped=0
for port in 3100 3001 3200; do
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "[stop] 端口 $port (pid: $(echo $pids | tr '\n' ' ')) → 停止"
    kill $pids 2>/dev/null || true
    stopped=$((stopped + 1))
  fi
done

# worker 是常驻进程但不固定端口,按命令名清理
worker_pids=$(pgrep -f "apps/worker/src/index.ts" 2>/dev/null || true)
if [ -n "$worker_pids" ]; then
  echo "[stop] worker (pid: $(echo $worker_pids | tr '\n' ' ')) → 停止"
  kill $worker_pids 2>/dev/null || true
  stopped=$((stopped + 1))
fi

if [ "$stopped" -eq 0 ]; then
  echo "[stop] 没有正在运行的应用进程。"
else
  # 给进程一点时间优雅退出
  sleep 2
  # 强制清理残留
  for port in 3100 3001 3200; do
    pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  done
  pkill -9 -f "apps/worker/src/index.ts" 2>/dev/null || true
  echo "[stop] 已停止 $stopped 类服务。"
fi

echo ""
echo "[stop] Docker 容器(Postgres/Redis/MinIO)仍在运行。"
echo "[stop] 如需关闭容器:docker compose down"
