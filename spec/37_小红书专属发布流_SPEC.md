# 37. 小红书专属发布流 SPEC

> 状态：已实施（2026-11-02，真实账号验收未执行，能力保持 beta）
> 关联：[real-platform-acceptance-runbook](../docs/delivery/real-platform-acceptance-runbook.md)、[crm-release-status](../docs/delivery/crm-release-status.md)
> 背景：用户评估「是否用 RPA/成熟库操作社媒」，结论为不引入商业 RPA、定向借鉴成熟开源库。小红书发布是当前最薄弱的平台适配，本 Spec 落地专属发布流。

## 1. 背景

`apps/browser-runner/src/publish-routes.ts` 的小红书发布走通用选择器表（`PUBLISH_SELECTORS.xiaohongshu`）：

1. 上传完成判断仅靠 `[class*="progress"]` 元素消失（30s 宽限后放弃等待）；
2. 成功判定只有 `waitForTimeout(3000)` 后取当前 URL，无发布成功页确认；
3. 标题/正文/话题均为「首命中即填」，无平台专属输入手法（小红书正文是 contenteditable、话题需走候选下拉）；
4. 登录失效无检测——cookie 失效时整条流程静默失败并返回假 `success: true`。

对比抖音已有 587 行专属流（`douyin-publish.ts`）。本 Spec 将小红书升级为同架构专属流，选择器与流程移植自 [dreammis/social-auto-upload](https://github.com/dreammis/social-auto-upload)（仓库主体 MIT、skills MIT-0）的 `uploader/xiaohongshu_uploader/main.py`（2026-11 版本，逐字核实）。

## 2. 目标与非目标

### 2.1 目标

- G1 新建 `apps/browser-runner/src/xhs-publish.ts`，`publishXiaohongshu(input)` 镜像 `publishDouyin` 结构与返回契约（`{ success, externalPostId?, externalUrl?, errorMessage? }`）。
- G2 视频/图文各自直达发布页：`https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video|image`。
- G3 上传完成判定：轮询上传 input 相邻 preview 区文本命中「上传成功/分辨率/重新上传/编辑封面/已上传/已选择/100%」；兜底为标题框可见。
- G4 输入手法对齐平台真实交互：标题 `input[placeholder*="填写标题"]` + 20 字截断；正文 `p[data-placeholder*="输入正文描述"]` 清空后逐字输入；话题 `#tag` 触发候选容器 `#creator-editor-topic-container` 后点击候选项，失败清残留不中断发布，上限 10 个。
- G5 成功判定：`waitForURL('**/publish/success**')`；不再接受「点完按钮等 3 秒」式假成功。
- G6 登录失效检测：URL 跳转 `/login` 或 `div[class*='login-box']` 可见 → 抛「小红书登录已失效，请在「集成 → 平台账号」重新扫码登录」（命中 worker 既有正则，转 `WAITING_HUMAN_CONFIRM`，worker 零改动）。
- G7 发布按钮接入既有 `clickWithVisionFallback` 视觉兜底；标题/正文填充失败接 `fillWithVisionFallback`。
- G8 `publish-routes.ts` 增加 xiaohongshu 专属分支，移除通用路径中的 xiaohongshu 选择器条目与「先传图后填文」特判（顺序内化进专属流）。

### 2.2 非目标

- 不做定时发布、视频封面设置、来源转载声明弹窗（上游均为可选增强）；
- 不做发布成功后 cookie 回写刷新（登录态生命周期仍走「失效→重新扫码」）；
- **不将 `xiaohongshu.publish` 从 `beta` 升级**——升 `verified` 必须按 Runbook 完成真实账号低量发布验收（外部笔记 ID、截图/日志证据）；
- 不改抖音/其他平台既有发布路径；
- 不做发布频控与截图证据落盘（独立缺口，另行立项）。

## 3. API

`POST /assist/publish` 入参与返回契约不变（worker `publish.execute.ts` 零改动）。变化仅在 browser-runner 内部分发：

- `platform === 'xiaohongshu'` → `publishXiaohongshu(...)`，返回 `{ success: boolean; externalPostId?: string; externalUrl?: string; errorMessage?: string }`；
- `externalPostId` 尽力提取（成功页 URL 命中 `/(explore|discovery\/item)\/([a-f0-9]+)/i` 时），提取不到时省略——不再合成 `pub-` 假 ID。

## 4. 关键移植细节（来源：social-auto-upload，MIT）

| 环节 | 选择器/规则 |
|---|---|
| 视频上传 input | `div[class^='upload-content'] input[class='upload-input']`；失败重传 `div.progress-div [class^="upload-btn-input"]` |
| 图文上传 input | 主选 `input[type="file"][accept*="image"]`，兜底视频选择器 |
| 上传完成 | preview 相邻 div 文本关键词（见 G3），轮询间隔 2s，deadline 240s（worker 总超时 5 分钟） |
| 标题 | `input[placeholder*="填写标题"]`，截断 20 字 |
| 正文 | `p[data-placeholder*="输入正文描述"]` |
| 话题候选 | `#creator-editor-topic-container` 与其 `.item` |
| 发布按钮 | `button:has-text("发布")` 重试循环 + 视觉兜底 |
| 成功页 | `**/publish/success**` URL 通配 |
| 登录失效 | URL 含 `/login` 或 `div[class*='login-box']` 可见 |

浏览器会话：新代码使用 `createStealthSession`（非 deprecated 的 `createHeadlessSession`）。

## 5. 测试矩阵

| 编号 | 场景 | 层级 | 验收 |
|---|---|---|---|
| A1 | `isXhsUploadCompleteText`：各关键词命中；「上传中 45%」、空串不命中 | 单元 | 全通过 |
| A2 | `truncateXhsTitle`：空串/恰 20 字/超长 | 单元 | 超长截断为 20 字 |
| A3 | `isXhsPublishSuccessUrl`：带/不带 query 的成功页 URL；非成功页 URL 不命中 | 单元 | 全通过 |
| A4 | 媒体挑选：video/image 扩展名分流、不存在文件过滤、无素材报错文案 | 单元 | 全通过 |
| A5 | `/assist/publish` 分发：`platform=xiaohongshu` 进入专属流并透传错误契约 | 单元（HTTP server + doMock） | 专属流被调用，返回 `{ success:false, errorMessage }` |
| A6 | 真实发布 | 不在本任务 | 按 Runbook 真实账号验收后另行记录 |

## 6. 能力边界声明

本 Spec 只升级代码路径质量。`packages/shared/src/platform-capabilities.ts` 中 `xiaohongshu.publish` 保持 `beta`；在真实账号低量发布验收完成前，任何 UI/文档不得宣称「支持小红书发布」。
