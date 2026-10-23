# 采集会话持久 Profile SPEC

## 1. 背景

线上获客搜索在登录态有效时仍返回零结果（见 spec/16），首要疑似根因是采集浏览器环境不可信：browser-runner 每次采集都用共享浏览器新建一次性 context，设备指纹、本地存储、Cookie 连续性每次全部重置，叠加机房 IP，极易被抖音风控识别。本机助手登录走的是持久 Chrome Profile（spec/12），已被平台信任。

本步是根因确认实验 + 低成本修复：**按账号使用持久化 user-data-dir 的浏览器 Profile 执行采集**，观察线上搜索成功率变化。

## 2. 目标

1. 获客链路（搜索 + 评论抓取）按账号使用持久 Profile；其余链路（发布、同步等）行为不变。
2. 相同账号并发请求复用同一持久浏览器实例，不重复启动、不因 user-data-dir 锁冲突失败。
3. 空闲超过 TTL 后自动关闭持久浏览器，释放资源；下次请求重新拉起，Profile 数据保留。
4. profileKey 严格白名单校验（`[A-Za-z0-9_-]`，≤64 字符），杜绝路径穿越。
5. 生产 compose 为 Profile 目录提供可写卷（现有挂载为只读）。
6. 未传 profileKey 的调用自动回退现有一次性会话，旧调用方零影响。

## 3. 非目标

- 不改变频控/验证码守卫（仍在服务端记账）。
- 不迁移登录（浏览器助手）链路。
- 不承诺持久 Profile 一定解决线上零结果；本步同时承担"确认根因是否为浏览器环境/指纹"的实验职责，结论以线上 `[search]` 日志与任务成功率证据为准。

## 4. 设计

```text
worker executeProspectingTask
  └─ POST /assist/search-videos        body: { platform, cookie, keyword, topN, profileKey: '<platform>-<accountId>' }
       └─ browser-runner createSession(cookie, url, headed, profileKey?)
            ├─ profileKey 存在 → launchPersistentContext(<PROFILE_ROOT>/<key>)
            │     · 复用运行中的实例（按 key 引用计数）
            │     · 释放后空闲 10 分钟自动关闭
            └─ 无 profileKey → 现有 createStealthSession（共享浏览器一次性 context）
```

- `PROFILE_ROOT = BROWSER_RUNNER_PROFILE_DIR ?? ${LOCAL_DATA_DIR:-平台默认}/browser-profiles`。
- 持久会话 close() 只关 page，不动 context；引用归零后由空闲定时器关闭整个 context（Chrome 进程随之退出）。
- Cookie 仍以服务端 cookieRef 为准，每次会话 addCookies 覆盖，Profile 内陈旧登录态不参与判定。

## 5. 测试矩阵

- 单元 `tests/unit/browser-runner/browser-session.test.ts` 扩展：
  - `sanitizeCrawlProfileKey`：合法 uuid/带平台前缀通过；含 `/`、`..`、空、超长被拒。
  - `crawlProfileDirectory`：落在 PROFILE_ROOT 下、env 覆盖生效。
  - mock launchPersistentContext：传 profileKey 走持久分支（userDataDir 含 key）；不传走原共享浏览器分支。

## 6. 验收标准

1. 单测先红后绿；`pnpm typecheck`、`pnpm lint`、全量单测通过。
2. 线上部署后获客任务正常执行，`docker compose logs browser-runner` 可见 `[search]` 日志且无 Profile 锁错误。
3. 多次执行后 Profile 目录按账号累积（`ls ${LOCAL_DATA_DIR}/browser-profiles`），用于与零结果关联分析。
