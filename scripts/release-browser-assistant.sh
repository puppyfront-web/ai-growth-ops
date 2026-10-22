#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# AI Growth Ops — 发布浏览器助手到 GitHub Releases
#
# 用户的下载来源:GitHub Release 资产 URL,
# 服务端 BROWSER_ASSISTANT_DOWNLOAD_URL 指向该 URL 即可。
#
# 前置:
#   1. gh 已登录: gh auth login (首次需要)
#   2. 代码已推送到 origin,当前分支与线上版本对应
#
# 用法:
#   ASSISTANT_API_ORIGIN=https://ops.example.com pnpm assistant:release
# ────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_ORIGIN="${ASSISTANT_API_ORIGIN:-}"
if [ -z "$API_ORIGIN" ]; then
  echo "✗ 请通过 ASSISTANT_API_ORIGIN 指定线上 API Origin(与 APP_URL 同源的 HTTPS 地址)"
  echo "  示例: ASSISTANT_API_ORIGIN=https://ops.example.com pnpm assistant:release"
  exit 1
fi
case "$API_ORIGIN" in
  https://*) ;;
  *) echo "✗ 线上安装包必须使用 HTTPS Origin,当前: $API_ORIGIN"; exit 1 ;;
esac

command -v gh >/dev/null || { echo "✗ 未安装 gh CLI: brew install gh"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "✗ gh 未登录,先运行: gh auth login"; exit 1; }

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)" \
  || { echo "✗ 无法确定远端仓库"; exit 1; }

VERSION="$(node -p "require('./apps/browser-bridge/package.json').version")"
TAG="assistant-v${VERSION}-$(date +%Y%m%d%H%M)"

echo "[release] 目标仓库: $REPO"
echo "[release] 内置可信 Origin: $API_ORIGIN"
echo "[release] 构建 $TAG …"
ASSISTANT_API_ORIGIN="$API_ORIGIN" BROWSER_ASSISTANT_TRUSTED_ORIGINS="$API_ORIGIN" \
  bash scripts/build-browser-assistant.sh

ZIP_PATH="apps/web/public/browser-assistant/BrowserAssistant-macOS.zip"
SHA_PATH="$ZIP_PATH.sha256"
SHA256="$(cut -d' ' -f1 "$SHA_PATH")"

echo "[release] 创建 GitHub Release $TAG …"
gh release create "$TAG" "$ZIP_PATH" "$SHA_PATH" \
  --title "浏览器助手 $TAG" \
  --notes "macOS 浏览器助手(ad-hoc 签名,未公证)。

- 可信 API Origin: \`$API_ORIGIN\`(构建时内置)
- SHA-256: \`$SHA256\`
- 安装:解压 zip,将 BrowserAssistant.app 拖入「应用程序」;首次打开请右键→打开
- 适用:macOS 12+(Intel / Apple Silicon)"

DOWNLOAD_URL="https://github.com/$REPO/releases/download/$TAG/BrowserAssistant-macOS.zip"
echo ""
echo "✅ 发布完成"
echo "   下载地址: $DOWNLOAD_URL"
echo "   服务端配置: BROWSER_ASSISTANT_DOWNLOAD_URL=$DOWNLOAD_URL"
