# 47. browser-runner DOM 兜底提取器回归夹具 SPEC

> 状态：规划冻结
> 关联：founding engineer 评审 P1-3（护城河模块的保护缺口）
> 现状：JSON 层提取器（搜索/评论/私信/条目挑选）已有较厚单测；**DOM 兜底路径零测试**——`extractSearchResultsFromDOM`、`extractCommentsFromDOM`（平台接口不可用时从页面 DOM 抢救数据的最后防线）与 `detectCaptcha`（验证码识别）均无保护。

## 1. 目标

- G1 两个 DOM 兜底提取器导出（纯 export，无行为变化）并以 **Playwright chromium + `page.setContent(HTML 夹具)** 的方式建立回归测试（落实"DOM 快照夹具"建议——夹具与真实平台解耦、无网络、确定性）。
- G2 `detectCaptcha` 同法覆盖（三种验证码文案命中 + 正常页面不误报）。
- G3 夹具按当前提取器逻辑构造忠实样本：搜索卡片（/video/ 与 /note/、去重、@作者、时间行干扰、容器外链接不收录）；评论容器（user 链接向上爬层、3-12 行判定、噪声行过滤、万单位点赞换算、secUid 提取、重复去重）。
- G4 真实平台改版后补新快照夹具即可扩展（人工按 Runbook 抓 HTML 存入同目录），不改测试骨架。

## 2. 非目标

- 不测 Playwright 交互流程（滚动/等待）与 stealth 行为（需真平台，属真实平台验收 Runbook 域）；不为 XHS DOM 兜底（当前实现返回空，无可测）。

## 3. 验收

| 场景 | 验收 |
|---|---|
| 搜索 DOM：常规/去重/note 类型/容器外排除 | 字段与数量断言 |
| 评论 DOM：合格项/噪声项/重复项/点赞万换算/secUid | 字段与数量断言 |
| 验证码：三种文案/正常页 | 布尔断言 |
| 既有套件无回归 | unit 全量通过 |
