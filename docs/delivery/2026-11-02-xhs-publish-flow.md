# 2026-11-02 小红书专属发布流（借鉴 social-auto-upload）

> 关联：[spec/37](../../spec/37_小红书专属发布流_SPEC.md)、[spec/38](../../spec/38_小红书专属发布流_Plan.md)
> 背景：用户评估「是否用 RPA/成熟库操作社媒」，结论为不引入商业 RPA、定向借鉴成熟开源库。本交付将小红书发布从「通用选择器硬填」升级为专属发布流。

## 改动清单

| 文件 | 变更 |
|---|---|
| `apps/browser-runner/src/xhs-publish.ts` | 新增。`publishXiaohongshu` 专属流：视频/图文直达 URL、上传完成文案判定、标题 20 字截断、正文清空重打、话题候选下拉、`**/publish/success**` 成功判定、登录失效检测、视觉兜底接入。选择器移植自 [dreammis/social-auto-upload](https://github.com/dreammis/social-auto-upload)（MIT）`uploader/xiaohongshu_uploader/main.py` |
| `apps/browser-runner/src/media-files.ts` | 新增。`pickVideoFile`/`pickImageFiles` 从 `douyin-publish.ts` 迁出为公共模块 |
| `apps/browser-runner/src/douyin-publish.ts` | 改 import 使用 `media-files.ts`，行为不变 |
| `apps/browser-runner/src/publish-routes.ts` | ① 新增 `platform === 'xiaohongshu'` 专属分支（与 douyin 并列、置于通用校验前）；② 移除 `PUBLISH_PAGE_URLS`/`PUBLISH_SELECTORS` 的 xiaohongshu 条目；③ 删除通用路径「XHS 先传图后填文」特判（顺序内化进专属流） |
| `tests/unit/browser-runner/xhs-publish.test.ts` | 新增。12 个用例（先红后绿） |
| `spec/37`、`spec/38` | 新增 SPEC 与 Plan |

## 验证证据

| 命令 | 结果 |
|---|---|
| `pnpm vitest run tests/unit/browser-runner/xhs-publish.test.ts`（实现前） | 1 failed — `Cannot find module .../xhs-publish`（RED 确认） |
| `pnpm vitest run tests/unit/browser-runner/xhs-publish.test.ts`（实现后） | 12 passed (12) |
| `pnpm typecheck` | 全部包 Done，无错误 |
| `pnpm lint` | 通过，无输出 |
| `pnpm test:unit` | 98 文件 / 634 用例全部通过（含新增 12 例，无新增失败） |

未运行 `pnpm test:integration`：本次改动仅限 browser-runner 内部分发与实现，不触及 API/数据库层（集成测试覆盖面），类型检查已覆盖跨包引用。

## 诚实声明与遗留

- **未执行真实小红书发布**。本交付只升级代码路径质量；`platform-capabilities.ts` 中 `xiaohongshu.publish` 保持 `beta`。真实有效性以 Runbook 真实账号低量发布验收为准（需测试账号与批准单）。
- 遗留项（另行立项）：
  1. 真实账号低量发布验收（升 `verified` 前置）；
  2. 发布成功后 cookie 自动续期；
  3. 视频封面设置、来源转载声明、定时发布；
  4. 发布/互动侧频控与截图证据落盘。
- 风险：移植选择器对应 2026-11 小红书创作者中心页面，平台改版仍可能漂移；已通过视觉兜底与「失败明确报错」缓解（不再返回假成功）。
