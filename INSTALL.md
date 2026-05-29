# INSTALL

## Goal

将 `ai-growth-ops` 安装为一套运行在 OpenClaw 中的 AI Native 运营执行内核，并让客户可以通过自然语言完成：

- 平台可用性检查
- 视频发布
- 小红书 / 抖音互动抓取前检查
- 互动抓取与回复建议

## 1. 安装前提

当前交付版本默认运行在 macOS 本机环境，要求如下：

- Node.js `v24` 或更高版本
- 已可正常使用的 OpenClaw runtime
- 仓库代码和 `node_modules` 已存在于本机
- 可访问本机浏览器
- 若要运行互动能力：
  - 已准备平台 cookie
  - 可启动 `browser-runner`

## 2. 进入项目目录

所有命令都从仓库根目录执行：

```bash
cd /Users/tutu/apps/ai-growth-ops
```

## 3. 首次环境检查

先确认运行时环境可用：

```bash
node --version
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts doctor
```

`doctor` 正常时会输出 JSON，重点看这些字段：

- `socialPublishSkillsRoot.exists`
- `browserRunnerUrl`
- `cookies`
- `livePublishPlatforms`
- `browserRunnerFallbackPlatforms`

如果这里已经报错，不要继续往下操作，先修环境。

## 4. 基础验证

建议按下面顺序执行：

```bash
./node_modules/.bin/tsc --project apps/runtime-core/tsconfig.json --noEmit
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts accounts:list
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts skills:list
```

当前交付机器预期账号如下：

- `douyin`: `default`, `main`
- `kuaishou`: `default`
- `wechat_channels`: `default`

## 5. 当前机器的可用范围

当前已经打通的实时发布 / 鉴权平台：

- `douyin`
- `wechat_channels`（底层映射到 `tencent`）
- `kuaishou`

当前已接入但依赖 `browser-runner` 或额外 cookie 的平台：

- `xiaohongshu`
- `zhihu`
- `baijiahao`

当前未交付 live 的平台：

- `wechat_official`

## 6. 客户在 OpenClaw 里怎么用

建议把下面这份提示词直接给 OpenClaw 使用：

- [2026-05-29-openclaw-customer-prompt.md](/Users/tutu/apps/ai-growth-ops/docs/delivery/2026-05-29-openclaw-customer-prompt.md)

使用方式：

1. 打开 OpenClaw
2. 进入本仓库所在工作目录
3. 先粘贴 prompt
4. 再让客户用自然语言提问

适合客户直接说的话包括：

- “帮我检查当前这台机器有哪些可用平台和账号”
- “帮我检查抖音 `main` 账号是否还能发布”
- “帮我把这个视频发到抖音”
- “帮我先检查小红书互动功能是否具备运行条件”
- “帮我抓取小红书互动并给我回复建议”

## 7. 发布前鉴权检查

正式发布前，先检查账号状态。

示例：

```bash
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=auth.check --platforms=douyin --account=main
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=auth.check --platforms=wechat_channels --account=default
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=auth.check --platforms=kuaishou --account=default
```

结果解释：

- `status=success`：账号可用
- `status=failed` 且 `error=cookie_not_found`：缺少 cookie
- `status=failed` 且包含 provider 错误：cookie 已失效或不合法

## 8. 发布命令

发布必须提供真实的本地视频路径。

示例：

```bash
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=douyin --account=main --title="Demo Title" --file=/absolute/path/video.mp4 --content="演示内容"
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=wechat_channels --account=default --title="Demo Title" --file=/absolute/path/video.mp4 --content="演示内容"
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=kuaishou --account=default --title="Demo Title" --file=/absolute/path/video.mp4 --content="演示内容"
```

如果视频路径错误，系统会返回结构化失败信息，而不是假成功。

## 9. 互动功能安装与运行

互动能力需要额外准备两项：

1. 平台 cookie
2. 已启动的 `browser-runner`

先启动 `browser-runner`：

```bash
./node_modules/.bin/tsx apps/browser-runner/src/server.ts
```

### 小红书互动

先设置 cookie：

```bash
export AI_GROWTH_OPS_XIAOHONGSHU_COOKIE='<cookie>'
```

然后执行：

```bash
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=interaction.fetch --platforms=xiaohongshu --account=demo
```

如果缺 cookie，系统会明确返回 `blocked` / `cookie_not_found`。

### 抖音互动

如果后续现场补好了抖音互动 cookie，也可以运行：

```bash
export AI_GROWTH_OPS_DOUYIN_COOKIE='<cookie>'
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=interaction.fetch --platforms=douyin --account=main
```

## 10. 推荐交付演示顺序

现场建议按这个顺序跑：

```bash
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts doctor
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts accounts:list
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts skills:list
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=auth.check --platforms=douyin --account=main
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=douyin --account=main --title="Demo Title" --file=/absolute/path/video.mp4 --content="演示内容"
```

如果客户要看互动能力，再继续：

```bash
./node_modules/.bin/tsx apps/browser-runner/src/server.ts
export AI_GROWTH_OPS_XIAOHONGSHU_COOKIE='<cookie>'
./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=interaction.fetch --platforms=xiaohongshu --account=demo
```

## 11. 交付资料

完整交付时请一并参考：

- [2026-05-29-openclaw-runtime-core-checklist.md](/Users/tutu/apps/ai-growth-ops/docs/delivery/2026-05-29-openclaw-runtime-core-checklist.md)
- [2026-05-29-openclaw-runtime-core-runbook.md](/Users/tutu/apps/ai-growth-ops/docs/delivery/2026-05-29-openclaw-runtime-core-runbook.md)
- [2026-05-29-openclaw-customer-prompt.md](/Users/tutu/apps/ai-growth-ops/docs/delivery/2026-05-29-openclaw-customer-prompt.md)
