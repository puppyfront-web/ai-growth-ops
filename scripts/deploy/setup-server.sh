#!/usr/bin/env bash
# =============================================================
# AI Growth Ops — 阿里云 ECS 服务器初始化（只跑一次）
# 用途：安装 Docker Engine + Compose 插件（走阿里云软件源），
#       配置镜像加速，并做基本校验。
# 适用：Ubuntu 22.04+（阿里云 ECS 默认镜像）。以 root 或 sudo 运行。
# 用法：sudo bash scripts/deploy/setup-server.sh [Docker加速器URL]
# =============================================================
set -euo pipefail

ACCELERATOR="${1:-}"

green() { printf '\033[0;32m✔ %s\033[0m\n' "$1"; }
yellow() { printf '\033[1;33m⚠ %s\033[0m\n' "$1"; }

if ! command -v apt-get >/dev/null 2>&1; then
  echo "本脚本面向 Ubuntu（apt）；其他系统请参照 Docker 官方文档手动安装。" >&2
  exit 1
fi

echo "==> 1/5 安装 Docker Engine（阿里云 docker-ce 源）"
apt-get update -qq
apt-get install -y -qq ca-certificates curl >/dev/null
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://mirrors.aliyun.com/docker-ce/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
systemctl enable --now docker
green "Docker 已安装：$(docker --version)"

echo "==> 2/5 配置 Docker 镜像加速器"
if [ -n "$ACCELERATOR" ]; then
  python3 - "$ACCELERATOR" <<'PY'
import json, sys

mirror = sys.argv[1]
path = "/etc/docker/daemon.json"
try:
    cfg = json.load(open(path))
except FileNotFoundError:
    cfg = {}
mirrors = cfg.setdefault("registry-mirrors", [])
if mirror not in mirrors:
    mirrors.insert(0, mirror)
json.dump(cfg, open(path, "w"), indent=2)
PY
  systemctl restart docker
  green "已配置加速器：$ACCELERATOR"
else
  yellow "未提供加速器 URL（阿里云控制台 容器镜像服务 → 镜像加速器 可获取专属地址）"
  yellow "拉取 postgres/redis/minio/node 等公共镜像慢或失败时，重跑："
  yellow "  sudo bash scripts/deploy/setup-server.sh https://<你的ID>.mirror.aliyuncs.com"
fi

echo "==> 3/5 将当前用户加入 docker 组（免 sudo）"
if [ "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  usermod -aG docker "$SUDO_USER"
  green "已将 $SUDO_USER 加入 docker 组（重新登录后生效）"
else
  yellow "以 root 运行或无普通用户，跳过"
fi

echo "==> 4/5 校验 Compose 插件"
docker compose version
green "Compose 插件可用"

echo "==> 5/5 完成自查"
yellow "安全组提醒：本系统 Web/API 只绑定服务器回环地址（127.0.0.1），"
yellow "不要在安全组放行 3000/3100 等端口；远程访问请用 SSH 隧道："
yellow "  ssh -L 3001:127.0.0.1:3001 <user>@<服务器IP>"
green "服务器初始化完成，下一步：bash scripts/deploy/init-env.sh && bash scripts/deploy/deploy.sh"
