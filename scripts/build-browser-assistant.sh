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
#   - 内置 Node 运行时取 nodejs.org 官方发行版的 bin/node（自包含、仅链接
#     系统库），SHA-256 以官方 SHASUMS256.txt 校验；禁止使用 PATH 中的
#     Homebrew node（其动态链接 /opt/homebrew 下的 libnode，单拷贝必坏）。
#   - 默认 universal（arm64 + x86_64）；ASSISTANT_ARCH=arm64|x86_64 构建单架构。
#   - 组装后有 node -v 冒烟门禁，包内运行时起不来即构建失败。
#   - 使用 ad-hoc 签名（codesign -），未做 Apple Developer ID 公证；
#     首次打开需 系统设置 → 隐私与安全性 → 「仍要打开」。
# ────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_NAME="BrowserAssistant.app"
RELEASE_DIR="$ROOT/release"
APP_DIR="$RELEASE_DIR/$APP_NAME"
OUT_DIR="$ROOT/apps/web/public/browser-assistant"
ZIP_PATH="$OUT_DIR/BrowserAssistant-macOS.zip"
VERSION="$(node -p "require('./apps/browser-bridge/package.json').version")"
BUILD_ID="$(date +%Y%m%d%H%M%S)"

# 内置 Node 运行时：官方发行版（bin/node 自包含），默认 universal
NODE_DISTRO_VERSION="${NODE_DISTRO_VERSION:-22.23.4}"
ASSISTANT_ARCH="${ASSISTANT_ARCH:-universal}"   # universal | arm64 | x86_64
# 下载镜像顺序可覆盖；校验始终使用 nodejs.org 官方 SHASUMS256.txt
NODE_DISTRO_MIRRORS="${NODE_DISTRO_MIRRORS:-https://nodejs.org/dist https://registry.npmmirror.com/-/binary/node}"
NODE_DISTRO_DIR="$RELEASE_DIR/node-distro"

if [ -z "${BROWSER_ASSISTANT_TRUSTED_ORIGINS:-}" ]; then
  echo "✗ 请通过 BROWSER_ASSISTANT_TRUSTED_ORIGINS 指定安装包内置的可信 API Origin"
  echo "  本地开发示例: BROWSER_ASSISTANT_TRUSTED_ORIGINS=http://localhost:3002 pnpm assistant:build"
  exit 1
fi

case "$ASSISTANT_ARCH" in
  universal) DISTRO_ARCHS="arm64 x64" ;;
  arm64) DISTRO_ARCHS="arm64" ;;
  x86_64|x64) DISTRO_ARCHS="x64" ;;
  *)
    echo "✗ 无效 ASSISTANT_ARCH: $ASSISTANT_ARCH（支持 universal/arm64/x86_64）"
    exit 1
    ;;
esac

# 下载并校验某架构的官方发行版，解出 bin/node 到缓存目录
fetch_node_binary() {
  local arch="$1"
  local tarball="node-v${NODE_DISTRO_VERSION}-darwin-${arch}.tar.gz"
  local cache="$NODE_DISTRO_DIR/node-v${NODE_DISTRO_VERSION}-darwin-${arch}"
  if [ -x "$cache/bin/node" ]; then
    echo "[assistant] 复用缓存 $tarball"
    return 0
  fi

  local shasums="$NODE_DISTRO_DIR/SHASUMS256-v${NODE_DISTRO_VERSION}.txt"
  if [ ! -s "$shasums" ]; then
    mkdir -p "$NODE_DISTRO_DIR"
    curl -fsSL --retry 3 --connect-timeout 15 \
      -o "$shasums" "https://nodejs.org/dist/v${NODE_DISTRO_VERSION}/SHASUMS256.txt"
  fi
  local expected
  expected="$(grep " ${tarball}\$" "$shasums" | cut -d' ' -f1)"
  if [ -z "$expected" ]; then
    echo "✗ SHASUMS256.txt 中没有 $tarball，请确认 NODE_DISTRO_VERSION=$NODE_DISTRO_VERSION 存在"
    exit 1
  fi

  local downloaded=""
  for mirror in $NODE_DISTRO_MIRRORS; do
    echo "[assistant] 下载 $mirror/v${NODE_DISTRO_VERSION}/$tarball …"
    if curl -fsSL --retry 3 --connect-timeout 15 --speed-time 30 --speed-limit 10240 \
      -o "$NODE_DISTRO_DIR/${tarball}.download" "$mirror/v${NODE_DISTRO_VERSION}/$tarball"; then
      downloaded="$NODE_DISTRO_DIR/${tarball}.download"
      break
    fi
    echo "[assistant] 镜像失败，尝试下一个: $mirror"
  done
  if [ -z "$downloaded" ]; then
    echo "✗ 所有镜像下载失败: $NODE_DISTRO_MIRRORS"
    exit 1
  fi

  local actual
  actual="$(shasum -a 256 "$downloaded" | cut -d' ' -f1)"
  if [ "$actual" != "$expected" ]; then
    echo "✗ SHA-256 校验失败: $tarball"
    echo "  期望 $expected"
    echo "  实际 $actual"
    exit 1
  fi

  rm -rf "$cache"
  mkdir -p "$cache/bin"
  tar -xzf "$downloaded" -C "$cache" --strip-components=1 '*/bin/node'
  mv "$downloaded" "$NODE_DISTRO_DIR/$tarball"
}

echo "[assistant] 构建浏览器助手 v$VERSION (build $BUILD_ID, arch=$ASSISTANT_ARCH, node=v$NODE_DISTRO_VERSION)"

for arch in $DISTRO_ARCHS; do
  fetch_node_binary "$arch"
done

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
// 双击直接启动（无 URL）时发系统通知指引后退出，不再静默驻留。
import Cocoa

final class StderrCollector {
  private var buffer = Data()
  private let lock = NSLock()

  func attach(to pipe: Pipe) {
    pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
      let chunk = handle.availableData
      if chunk.isEmpty {
        handle.readabilityHandler = nil
      } else {
        self?.append(chunk)
      }
    }
  }

  private func append(_ data: Data) {
    lock.lock()
    buffer.append(data)
    lock.unlock()
  }

  func utf8() -> String {
    lock.lock()
    defer { lock.unlock() }
    return String(data: buffer, encoding: .utf8) ?? ""
  }
}

final class Delegate: NSObject, NSApplicationDelegate {
  private var receivedUrl = false

  func applicationDidFinishLaunching(_ notification: Notification) {
    // 用户双击直接打开：短暂等待 URL 事件（LaunchServices 拉起时随后送达），
    // 没有就说明不是授权流程，给出指引后退出。
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
      if self.receivedUrl { return }
      Self.notify("浏览器助手已就绪。请回到系统网页点击「授权」，助手会自动打开。")
      exit(0)
    }
  }

  func application(_ application: NSApplication, open urls: [URL]) {
    receivedUrl = true
    let resources = Bundle.main.resourcePath ?? ""
    for launchUrl in urls.compactMap({ $0.absoluteString }) {
      let process = Process()
      process.executableURL = URL(fileURLWithPath: "\(resources)/assistant.sh")
      process.arguments = [launchUrl]
      var environment = ProcessInfo.processInfo.environment
      environment["BROWSER_ASSISTANT_NOTIFY"] = "1"
      process.environment = environment
      let collector = StderrCollector()
      let stderrPipe = Pipe()
      process.standardError = stderrPipe
      do {
        try process.run()
      } catch {
        Self.notify("浏览器助手启动失败，请重新下载安装浏览器助手后重试。")
        exit(1)
      }
      collector.attach(to: stderrPipe)
      DispatchQueue.global().async {
        process.waitUntilExit()
        // 壳 5 秒后退出，只有秒级崩溃会走到这里；JS 层已发过失败通知的
        // （stderr 含 index.ts 的「浏览器授权失败」标记）不重复打扰。
        let output = collector.utf8()
        if process.terminationStatus != 0 && !output.contains("浏览器授权失败") {
          Self.appendLog(output)
          Self.notify("浏览器助手启动失败（内部错误），请重新下载安装包；详情已写入 assistant.log。")
        }
      }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 5) { exit(0) }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }

  private static func notify(_ body: String) {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
    task.arguments = ["-e", "display notification \"\(body)\" with title \"浏览器助手\""]
    try? task.run()
  }

  private static func appendLog(_ text: String) {
    let directory = NSHomeDirectory()
      + "/Library/Application Support/ai-growth-ops/browser-bridge"
    try? FileManager.default.createDirectory(
      atPath: directory, withIntermediateDirectories: true
    )
    let path = directory + "/assistant.log"
    if !FileManager.default.fileExists(atPath: path) {
      FileManager.default.createFile(atPath: path, contents: nil)
    }
    guard let handle = FileHandle(forWritingAtPath: path) else { return }
    defer { try? handle.close() }
    _ = try? handle.seekToEnd()
    let stamped = "[\(ISO8601DateFormatter().string(from: Date()))]\n\(text)\n"
    if let data = stamped.data(using: .utf8) {
      try? handle.write(contentsOf: data)
    }
  }
}

let app = NSApplication.shared
let delegate = Delegate()
app.delegate = delegate
app.run()
SWIFT

echo "[assistant] compile native launcher (arch=$ASSISTANT_ARCH)"
# Swift 6 swift-driver 已移除 -arch，按目标各编一份再 lipo 合并
SWIFT="swiftc"
command -v swiftc >/dev/null || SWIFT="xcrun swiftc"
LAUNCHER_BIN="$APP_DIR/Contents/MacOS/BrowserAssistant"
LAUNCHER_SRC="$RELEASE_DIR/BrowserAssistantLauncher.swift"
compile_launcher() {
  local target="$1" output="$2"
  "$SWIFT" -O -target "$target-apple-macos12.0" -o "$output" "$LAUNCHER_SRC"
}
case "$ASSISTANT_ARCH" in
  arm64)
    compile_launcher arm64 "$LAUNCHER_BIN"
    ;;
  x86_64|x64)
    compile_launcher x86_64 "$LAUNCHER_BIN"
    ;;
  universal)
    compile_launcher arm64 "$LAUNCHER_BIN.arm64"
    compile_launcher x86_64 "$LAUNCHER_BIN.x64"
    lipo -create "$LAUNCHER_BIN.arm64" "$LAUNCHER_BIN.x64" -output "$LAUNCHER_BIN"
    rm -f "$LAUNCHER_BIN.arm64" "$LAUNCHER_BIN.x64"
    ;;
esac

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

echo "[assistant] 组装内置 Node 运行时…"
BUNDLED_NODE="$APP_DIR/Contents/Resources/node"
if [ "$ASSISTANT_ARCH" = "universal" ]; then
  lipo -create \
    "$NODE_DISTRO_DIR/node-v${NODE_DISTRO_VERSION}-darwin-arm64/bin/node" \
    "$NODE_DISTRO_DIR/node-v${NODE_DISTRO_VERSION}-darwin-x64/bin/node" \
    -output "$BUNDLED_NODE"
else
  cp "$NODE_DISTRO_DIR/node-v${NODE_DISTRO_VERSION}-darwin-${DISTRO_ARCHS%% *}/bin/node" \
    "$BUNDLED_NODE"
fi
chmod +x "$BUNDLED_NODE"

cp "$BUNDLE_JS" "$APP_DIR/Contents/Resources/main.mjs"
cp -R "$ROOT/node_modules/playwright-core" "$APP_DIR/Contents/Resources/node_modules/playwright-core"

# 构建时烘焙可信 Origin 清单；运行期环境变量可追加但不能绕过
printf '# 由 pnpm assistant:build 写入\n%s\n' \
  "${BROWSER_ASSISTANT_TRUSTED_ORIGINS//,/\\n}" \
  > "$APP_DIR/Contents/Resources/trusted-origins.conf"
echo "$VERSION ($BUILD_ID)" > "$APP_DIR/Contents/Resources/VERSION.txt"

echo "[assistant] 冒烟门禁：包内运行时必须可启动…"
SMOKE="$("$BUNDLED_NODE" -v 2>&1)" || {
  echo "✗ 冒烟失败：包内 node 无法启动（dyld/签名问题）"
  echo "$SMOKE"
  exit 1
}
if [ "$SMOKE" != "v$NODE_DISTRO_VERSION" ]; then
  echo "✗ 冒烟失败：包内 node 版本 $SMOKE ≠ v$NODE_DISTRO_VERSION"
  exit 1
fi
LAUNCHER_ARCHS="$(lipo -archs "$APP_DIR/Contents/MacOS/BrowserAssistant")"
NODE_ARCHS="$(lipo -archs "$BUNDLED_NODE")"
LAUNCHER_ARCH_LIST=",${LAUNCHER_ARCHS// /,},"
for want in $NODE_ARCHS; do
  case "$LAUNCHER_ARCH_LIST" in
    *",$want,"*) ;;
    *) echo "✗ 架构不匹配：启动器[$LAUNCHER_ARCHS] 缺少 node 含有的 $want"; exit 1 ;;
  esac
done
echo "[assistant] 冒烟通过: node $SMOKE, launcher[$LAUNCHER_ARCHS], node[$NODE_ARCHS]"

if command -v codesign >/dev/null; then
  echo "[assistant] ad-hoc 签名…"
  codesign --force --deep --sign - "$APP_DIR" >/dev/null
  codesign --verify "$APP_DIR" && echo "[assistant] 签名校验通过 (ad-hoc)"
  # 深度签名后运行时二进制必须仍可执行
  "$BUNDLED_NODE" -v >/dev/null
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
echo "   arch:    node[$NODE_ARCHS] / launcher[$LAUNCHER_ARCHS]"
echo "   download: set BROWSER_ASSISTANT_DOWNLOAD_URL to the zip public URL"
