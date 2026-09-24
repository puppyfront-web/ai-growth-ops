#!/usr/bin/env bash
# =============================================================
# AI Growth Ops — 日常更新（在服务器的仓库根目录运行）
# 流程：拉取代码 → 重建镜像 → 容器内迁移 → 滚动重启 → 健康检查
# 用法：bash scripts/deploy/update.sh [git ref，默认 origin 当前分支]
# 回滚：git 回退后重跑本脚本；数据库结构变更前请先备份。
# =============================================================
set -euo pipefail

cd "$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE="docker compose -f docker-compose.prod.yml"
REF="${1:-}"

green() { printf '\033[0;32m✔ %s\033[0m\n' "$1"; }
red() { printf '\033[0;31m✖ %s\033[0m\n' "$1"; }
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

[ -f .env ] || { red "缺少 .env"; exit 1; }
# shellcheck disable=SC1091
set -a; source .env; set +a

step "1/5 备份提醒"
echo "更新前建议先备份：node scripts/backup-local-data.mjs"
echo "（涉及数据库结构变更时强烈建议）继续? [y/N] "
read -r answer
case "$answer" in y|Y) ;; *) red "已取消"; exit 1 ;; esac

step "2/5 拉取代码"
git fetch origin
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
TARGET="${REF:-origin/${CURRENT_BRANCH}}"
git merge --ff-only "$TARGET"
green "已更新到 $(git log --oneline -1)"

step "3/5 重建镜像"
$COMPOSE build

step "4/5 数据库迁移 + 重启"
$COMPOSE run --rm api pnpm db:deploy
$COMPOSE up -d

step "5/5 健康检查"
API_PORT="${API_PORT:-3100}"
ok=""
for i in $(seq 1 45); do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" | grep -q '"status":"ok"'; then
    ok=1; break
  fi
  sleep 4
done
[ -n "$ok" ] && green "更新完成，服务健康" || { red "健康检查未通过，排查：$COMPOSE logs --tail=100 api worker"; exit 1; }
