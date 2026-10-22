#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# AI Growth Ops — 构建浏览器助手 macOS 安装包（.app + zip）
#
# 产物:
#   release/BrowserAssistant.app                      — 可直接安装的 .app
#   apps/web/public/browser-assistant/BrowserAssistant-macOS.zip
#     — Web「下载安装浏览器助手」按钮的下载产物
#     — BROWSER_ASSISTANT_DOWNLOAD_URL 指向该 zip 的对外地址
#
# 用法:
#   BROWSER_ASSISTANT_TRUSTED_ORIGINS="https://ops.example.com" \
#     pnpm assistant:build
#
# 说明:
#   - 使用 ad-hoc 签名（codesign -），未做 Apple Developer ID 公证；
#     首次打开需右键→打开，或 `xattr -d com.apple.quarantine`。
#   - NODE_BIN 默认取 PATH 中第一个 node；如需分发通用（Intel+Apple Silicon）
#     二进制，用 universal node 启动本脚本。
# ────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_NAME="BrowserAssistant.app"
RELEASE_DIR="$ROOT/release"
APP_DIR="$RELEASE_DIR/$APP_NAME"
OUT_DIR="$ROOT/apps/web/public/browser-assistant"
ZIP_PATH="$OUT_DIR/BrowserAssistant-macOS.zip"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
VERSION="$(node -p "require('./apps/browser-bridge/package.json').version")"
BUILD_ID="$(date +%Y%m%d%H%M%S)"

NODE_ARCHS="$(lipo -archs "$NODE_BIN" 2>/dev/null || echo unknown)"
if [ "$NODE_ARCHS" = "arm64" ] || [ "$NODE_ARCHS" = "x86_64" ]; then
  echo "[assistant] ⚠ 内置 Node 仅含 $NODE_ARCHS——安装包只能在同架构 Mac 上运行"
  echo "  如需 Intel+Apple Silicon 通用包,用 universal node 构建: NODE_BIN=<universal-node-path> pnpm assistant:build"
fi

if [ -z "${BROWSER_ASSISTANT_TRUSTED_ORIGINS:-}" ]; then
  echo "✗ 请通过 BROWSER_ASSISTANT_TRUSTED_ORIGINS 指定安装包内置的可信 API Origin"
  echo "  本地开发示例: BROWSER_ASSISTANT_TRUSTED_ORIGINS=http://localhost:3002 pnpm assistant:build"
  exit 1
fi

echo "[assistant] 构建浏览器助手 v$VERSION (build $BUILD_ID)"
echo "[assistant] Node 运行时: $NODE_BIN ($("$NODE_BIN" -v))"

echo "[assistant] 编译自包含 bridge bundle…"
pnpm --filter @ai-growth-ops/browser-bridge build
BUNDLE_JS="$RELEASE_DIR/main.mjs"
# tsup 产物把 workspace 依赖留作 external；这里用 esbuild 再打一层,
# 把 @ai-growth-ops/shared 一并内联,playwright-core 仍走随包 node_modules。
"$ROOT/node_modules/.bin/esbuild" "$ROOT/apps/browser-bridge/dist/index.js" \
  --bundle --platform=node --format=esm \
  --external:playwright-core \
  --outfile="$BUNDLE_JS"
[ -s "$BUNDLE_JS" ] || { echo "✗ bundle 生成失败"; exit 1; }

echo "[assistant] 组装 .app…"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources/node_modules"

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleName</key><string>BrowserAssistant</string>
  <key>CFBundleDisplayName</key><string>浏览器助手</string>
  <key>CFBundleExecutable</key><string>BrowserAssistant</string>
  <key>CFBundleIdentifier</key><string>com.ai-growth-ops.browser-assistant</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleVersion</key><string>${BUILD_ID}</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><true/>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key><string>com.ai-growth-ops.browser-assistant</string>
      <key>CFBundleURLSchemes</key>
      <array><string>aigrowthops</string></array>
    </dict>
  </array>
</dict>
</plist>
PLIST

cat > "$RELEASE_DIR/BrowserAssistantLauncher.swift" <<'SWIFT'
// 浏览器助手启动器：接收 aigrowthops:// URL Scheme 事件后拉起 Resources 内的助手。
// URL 通过 Apple Event 送达（bash 脚本无法接收），因此用最小 Cocoa 壳编译。
import Cocoa

final class Delegate: NSObject, NSApplicationDelegate {
  func application(_ application: NSApplication, open urls: [URL]) {
    guard let launchUrl = urls.first?.absoluteString else { return }
    let resources = Bundle.main.resourcePath ?? ""
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "\(resources)/assistant.sh")
    process.arguments = [launchUrl]
    process.environment = ProcessInfo.processInfo.environment.merging(
      ["BROWSER_ASSISTANT_NOTIFY": "1"]
    ) { _, new in new }
    try? process.run()
    DispatchQueue.main.asyncAfter(deadline: .now() + 5) { exit(0) }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }
}

let app = NSApplication.shared
let delegate = Delegate()
app.delegate = delegate
app.run()
SWIFT

echo "[assistant] 编译原生启动器…"
swiftc -O -o "$APP_DIR/Contents/MacOS/BrowserAssistant" \
  "$RELEASE_DIR/BrowserAssistantLauncher.swift" 2>/dev/null \
  || xcrun swiftc -O -o "$APP_DIR/Contents/MacOS/BrowserAssistant" \
  "$RELEASE_DIR/BrowserAssistantLauncher.swift"

cat > "$APP_DIR/Contents/Resources/assistant.sh" <<'LAUNCHER'
#!/bin/bash
# 由 BrowserAssistant(原生壳)调起:参数为 aigrowthops:// 授权链接。
set -u
RES="$(cd "$(dirname "$0")" && pwd)"
LAUNCH_URL="${1:-}"
for arg in "$@"; do
  case "$arg" in
    aigrowthops://*) LAUNCH_URL="$arg" ;;
  esac
done

if [ -z "$LAUNCH_URL" ]; then
  /usr/bin/osascript -e 'display notification "请从系统网页点击「授权」发起，浏览器助手会自动打开。" with title "浏览器助手"' || true
  exit 0
fi

exec "$RES/node" "$RES/main.mjs" "$LAUNCH_URL"
LAUNCHER
chmod +x "$APP_DIR/Contents/Resources/assistant.sh"

echo "[assistant] 复制运行时与依赖…"
cp "$NODE_BIN" "$APP_DIR/Contents/Resources/node"
chmod +x "$APP_DIR/Contents/Resources/node"
cp "$BUNDLE_JS" "$APP_DIR/Contents/Resources/main.mjs"
cp -R "$ROOT/node_modules/playwright-core" "$APP_DIR/Contents/Resources/node_modules/playwright-core"

# 构建时烘焙可信 Origin 清单；运行期环境变量可追加但不能绕过
printf '# 由 pnpm assistant:build 写入\n%s\n' \
  "${BROWSER_ASSISTANT_TRUSTED_ORIGINS//,/\\n}" \
  > "$APP_DIR/Contents/Resources/trusted-origins.conf"
echo "$VERSION ($BUILD_ID)" > "$APP_DIR/Contents/Resources/VERSION.txt"

if command -v codesign >/dev/null; then
  echo "[assistant] ad-hoc 签名…"
  codesign --force --deep --sign - "$APP_DIR" >/dev/null
  codesign --verify "$APP_DIR" && echo "[assistant] 签名校验通过 (ad-hoc)"
else
  echo "[assistant] ⚠ 未找到 codesign,跳过签名"
fi

echo "[assistant] 打包 zip…"
mkdir -p "$OUT_DIR"
rm -f "$ZIP_PATH"
ditto -c -k --sequesterRsrc --keepParent "$APP_DIR" "$ZIP_PATH"
shasum -a 256 "$ZIP_PATH" | tee "$OUT_DIR/BrowserAssistant-macOS.zip.sha256"

echo ""
echo "✅ 浏览器助手构建完成"
echo "   .app:    $APP_DIR"
echo "   zip:     $ZIP_PATH ($(du -h "$ZIP_PATH" | cut -f1))"
echo "   下载地址: 由 BROWSER_ASSISTANT_DOWNLOAD_URL 指向 zip 的对外 URL"
