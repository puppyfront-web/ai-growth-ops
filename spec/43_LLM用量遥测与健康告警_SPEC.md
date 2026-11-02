# 43. LLM 用量遥测与健康告警（成本可观测）SPEC

> 状态：已实施（2026-11-03）
> 关联：founding engineer 评审 P1-1；402 余额不足事故（2026-10-23 ~ 11-02 挂 10 天无人发现）
> 背景：`ProviderRunLog` 表存在但**零写入**；token 用量只在内存 tracker（重启即丢）；LLM 失败（402/401）只是 message 文本冒泡，余额耗尽无任何主动告警。

## 1. 目标

- G1 **遥测落库**：语义评分每批次调用写 `ProviderRunLog`（成功：token 三元组/耗时/provider/model；失败：分类错误码+消息截断）。表新增可空字段：`organizationId`、`model`、`promptTokens`、`completionTokens`、`totalTokens` + 索引 `[organizationId, createdAt]`。
- G2 **错误分类**（shared 纯函数 `classifyLlmError`）：quota（402/insufficient balance/quota）/ auth（401/invalid key）/ timeout / parse / not_configured / error。
- G3 **即时告警**：语义评分失败且分类为 quota/auth 时创建 Notification（critical，actionUrl 指向 LLM 配置页），同组织同错误码当日去重。
- G4 **每日兜底检查**（worker）：扫描 24h 内 ProviderRunLog 的 quota/auth 失败，按组织补发（去重）通知。
- G5 **用量聚合 API**：`GET /api/analytics/llm-usage?days=`（analytics:view）→ 按模型聚合 {calls, failures, tokens, avgLatencyMs} + 最近一次失败；组织隔离。
- G6 **UI**：成本与 ROI 页新增「AI 算力用量」区块（模型表 + 最近失败提示），复用页面 days 切换。

## 2. 非目标

- 不按币种估算金额（各 provider 价格不同且常变，展示 token 数与调用数，金额估算待价格表机制另行做）；不主动探测余额（发真实请求花钱，被动依赖真实调用失败）；不改 packages/ai/skills 的返回结构（在 database 侧调用点记录）。

## 3. 验收

| 场景 | 层级 | 验收 |
|---|---|---|
| classifyLlmError 分类 | unit | 402/401/timeout/parse/未配置/未知 |
| 用量聚合 + 组织隔离 | 集成 | byModel 计数/token 汇总正确；他组织不可见；days 过滤 |
| 告警去重 | 集成 | 同组织同码当日只 1 条；跨日再发 |
| UI 区块 | web 单测/手工 | 表格渲染 + 最近失败提示 |
