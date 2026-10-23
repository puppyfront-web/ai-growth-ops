# 获客搜索零结果诊断 SPEC

## 1. 背景

线上（Docker 部署 api/worker/browser-runner）出现如下现象：用户通过浏览器助手扫码登录抖音成功后执行智能获客任务，任务状态为「已完成」，但 视频 0 / 评论 0 / 潜客 0，并收到警告：

> 未抓取到评论，可能是 Cookie 失效、触发验证码或搜索无结果，请检查抖音登录后重新执行

实际账号登录态有效（扫码授权与健康检查均通过），警告内容与事实矛盾，误导用户反复重新登录。

### 1.1 根因链路

1. `packages/database/src/prospecting.ts` `executeProspectingTask` → `crawlSearchQueryComments` → `POST {BROWSER_RUNNER_URL}/assist/search-videos`。
2. browser-runner `runKeywordVideoSearch`（`apps/browser-runner/src/assist-routes.ts`）在**服务器上**用 headless Chromium 打开 `https://www.douyin.com/search/<关键词>?type=video`，仅依赖 DOM 选择器 `#search-result-container a[href*="/video/"]` 提取结果。
3. 结果为空时该函数返回 `results: []`，**不携带任何原因**（`handleSearchAndFetchComments` 有 message，`/assist/search-videos` 没有）。
4. worker 侧 `items.length === 0` 直接返回空数组，最终落入零结果兜底警告 `未抓取到评论，可能是 Cookie 失效…`。

搜索页为空的常见真实原因与 Cookie 失效无关：数据中心 IP 触发平台风控（页面渲染验证/空白，且不命中 `detectCaptcha` 的 3 条硬编码文案）、抖音前端 DOM 结构变化导致选择器失效、搜索确实无结果、搜索页处于未登录状态。当前实现无法区分这些情况，也没有服务端日志。

## 2. 目标

1. `/assist/search-videos` 在结果为空时返回机器可读的 `reasonCode` 与面向用户的 `message`，说明具体原因。
2. 搜索结果提取增加网络接口兜底（拦截 `/aweme/v1/web/search/item/` 等 XHR，复用已测试的 `extractSearchResults`），降低 DOM 结构变化的脆弱性。
3. 任务零结果警告按真实原因生成：页面未加载/需登录/无结果/旧版 runner 未知（保留 Cookie 提示为兜底），并说明下一步。
4. browser-runner 记录搜索诊断日志（关键词、容器是否存在、API 命中数、结果数、原因），线上可查。
5. 空原因信号满足可单测的纯函数：信号分类器与结果合并函数导出并覆盖单元测试。

## 3. 非目标

- 不做验证码破解、滑块自动化或其他风控规避。
- 不改变任务状态机：搜索为空仍按「已完成 + 警告」结束，不改判 failed。
- 不改浏览器助手（登录链路）与 cookie 白名单。
- 不调整 `PROSPECTING_SUPPORTED_PLATFORMS` 或宣称新的平台能力。

## 4. 数据模型与 API

### 4.1 `/assist/search-videos` 响应（向后兼容，新增可选字段）

```ts
{
  keyword: string;
  results: Array<{ contentId: string; title: string; author: string; awemeType?: number }>;
  captchaRequired?: boolean;
  message?: string;      // 空结果时的中文原因说明
  reasonCode?: 'SEARCH_PAGE_NOT_LOADED' | 'SEARCH_LOGIN_REQUIRED' | 'SEARCH_EMPTY' | 'SEARCH_UNKNOWN';
}
```

worker 侧在「搜索有结果但全被去重跳过」时额外生成 `SEARCH_ALL_SKIPPED`（不来自 browser-runner）。

### 4.2 `prospectingTask.metadata`（新增可选字段，不改表结构）

- `searchEmptyReasons?: string[]` — 每个空结果 query 的 reasonCode 去重列表（机器可读，供后续分析）。

## 5. 行为规格

### 5.1 browser-runner `runKeywordVideoSearch`

- 打开搜索页前注册 response 监听，拦截 `SEARCH_API_PATTERNS`（douyin: `/aweme/v1/web/search/item/` 等，复用现有 `_SEARCH_API_PATTERNS` 常量），用 `parseJsonBigInt` + `extractSearchResults` 解析。
- DOM 提取与网络提取按 `contentId` 去重合并，任一路径有结果即成功。
- 合并结果为空且未检出验证码时，采集页面信号并分类：

| 信号 | reasonCode | message |
| --- | --- | --- |
| 结果容器不存在（`#search-result-container` 及兜底选择器均无视频链接） | `SEARCH_PAGE_NOT_LOADED` | 搜索页未加载出结果，可能被平台风控拦截或页面结构已变化 |
| 页面可见「扫码登录」登录弹层 | `SEARCH_LOGIN_REQUIRED` | 搜索页要求登录，账号 Cookie 可能未在搜索页生效 |
| 容器存在、无登录弹层、API 返回空列表或未命中 | `SEARCH_EMPTY` | 搜索完成但没有匹配结果 |
| 其他（信号矛盾/兜底） | `SEARCH_UNKNOWN` | 搜索未返回结果，原因未识别 |

- 结果为空且容器缺失时允许一次页面重载重试（等待后重新提取），仍为空再分类。
- 输出一行诊断日志：`[search] platform= keyword= container= apiHits= dom= results= reason=`。

### 5.2 worker/prospecting 警告生成

- `crawlSearchQueryComments` 读取 `searchPayload.message`/`reasonCode`，空结果时向上返回每个 query 的原因。
- `executeProspectingTask` 汇总所有 query 的 `searchEmptyReasons`，写入 `metadata.searchEmptyReasons`，零结果警告文案由共享纯函数 `buildZeroResultWarning` 生成：

| 输入 | 警告 |
| --- | --- |
| 评论 0 + 原因含 `SEARCH_PAGE_NOT_LOADED` | 抖音搜索页未加载出结果（多为平台风控拦截或页面结构变化），任务已按零结果结束；可稍后重试，或打开浏览器完成验证后重新执行 |
| 评论 0 + 原因含 `SEARCH_LOGIN_REQUIRED` | 搜索页要求登录，账号登录态未在搜索页生效；请在「集成配置」重新扫码授权后再执行 |
| 评论 0 + 原因含 `SEARCH_ALL_SKIPPED`（搜索有结果但全被「近 N 天已抓」去重跳过，worker 侧生成） | 搜索到的视频均为近期已抓取，已自动跳过；可勾选「强制重抓」或调整关键词后重新执行 |
| 评论 0 + 原因仅 `SEARCH_EMPTY` | 关键词搜索无结果；可调整关键词后重新执行 |
| 评论 0 + 无原因（旧版 runner/未知） | 保留现文案：未抓取到评论，可能是 Cookie 失效、触发验证码或搜索无结果，请检查抖音登录后重新执行 |
| 评论 > 0 + 潜客 0 | 现文案不变：已抓取评论但未找到达到阈值的潜客… |

## 6. 测试矩阵

- 单元（`tests/unit/browser-runner/search-diagnostics.test.ts`）：
  - `classifySearchEmptyReason`：容器缺失→NOT_LOADED；登录弹层→LOGIN_REQUIRED；容器在+无弹层→EMPTY；空信号→UNKNOWN；优先级（登录弹层 > 容器缺失）。
  - `mergeSearchResults`：DOM/网络双源去重；网络有 DOM 无时取网络；均空返回空。
- 单元（`tests/unit/shared/prospect-zero-warning.test.ts`）：
  - `buildZeroResultWarning` 全部分支（上表），兼容旧行为（无原因→旧文案；有重复潜客→undefined；评论>0→阈值文案）。
- 回归：`tests/unit/browser-runner/search-extract.test.ts` 现有断言不变化。

## 7. 验收标准

1. 单测新增且先红后绿；`pnpm typecheck`、`pnpm lint` 通过。
2. `runKeywordVideoSearch` 空结果时响应含 `reasonCode`/`message`，且有诊断日志可 grep。
3. 线上复现同类任务时，警告不再断言「Cookie 失效」，而是给出页面级真实原因与下一步。
