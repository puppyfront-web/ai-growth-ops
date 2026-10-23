# 获客潜客列表倒序与同账号合并 SPEC

## 1. 背景

用户反馈智能获客任务详情页的潜客列表中，**同一账号出现多行**。根因已定位：

- `ProspectCandidate` 唯一约束为 `@@unique([prospectingTaskId, userKey])`，而 `userKey = externalUserId ?? userNickname`（`packages/shared/src/prospect-aggregate.ts`）。
- 抖音采集有两条链路：**结构化接口**的评论带数字 UID（`user.uid`）→ `userKey = 数字UID`；**DOM 兜底**（`apps/browser-runner/src/assist-routes.ts` 评论 DOM 解析）拿不到数字 UID，从评论链接提取 secUid 作为 `externalUserId` → `userKey = secUid`（`MS4wLjABAAAA...`）。
- 两条链路对同一账号生成不同 key，各建一行；列表按行展示即出现"同一账号两次"。当前库 183 行中已存在此类成对行（同 `userHomepage`、不同 `userKey`）。
- 两条链路都携带 `userHomepage = https://www.douyin.com/user/<secUid>`（结构化：`douyinUserHomepage(user)`；DOM：从 href 提取），**secUid 是双方都能拿到的账号稳定标识**。

排序方面：候选列表固定 `[{ relevanceScore: 'desc' }, { id: 'asc' }]`（`spec/21` 明确"不做自定义排序"），用户需要时间倒序（最新采集在前）。

## 2. 目标

1. **写时统一账号标识**：聚合时 `userKey = secUidFromHomepage(userHomepage) ?? externalUserId ?? userNickname`——两条抖音链路对同一账号生成同一 key，未来不再分叉。
2. **存量合并**：领域函数按 `(prospectingTaskId, 主页 secUid)` 分组，将同账号多行合并为一行（evidence 并集、commentCount 重算、评分取最高行、保留 customerId 归属），在任务潜客落库尾部自动执行，并可一次性回填存量。
3. **匹配增强**：落库时 existing 行索引与跨任务 30 天抑制索引同时按 `userKey` 与 `secUid(主页)` 双键匹配，避免"数字老行 + secUid 新行"残余分叉。
4. **列表排序**：`GET /api/prospecting/tasks/:id/candidates` 新增 `sort` 参数：`relevance`（默认，现状相关度降序）/ `latest`（采集时间倒序）；前端筛选栏增加排序切换。深链 `#candidate-{id}` 在两种排序下均能定位所在页。

## 3. 非目标

- 不改小红书等其他平台采集（单链路无分叉；其评论无主页字段，维持现状 key 规则）。
- 不做跨任务合并视图（跨任务重复由既有 30 天抑制 + 双键索引阻止新增；存量跨任务不回填合并）。
- 不改评分、转客户、画像补采链路的行为（合并只影响行归属，不改字段语义）。
- 不改导出 CSV 排序。

## 4. 数据与算法

### 4.1 secUid 提取（`packages/shared`）

```ts
secUidFromHomepage(homepage?: string | null): string | null
```

取 `https://www.douyin.com/user/<seg>` 的最后路径段；`seg` 为空或纯数字返回 null（纯数字可能是数字 UID 形式的主页，不作合并依据——只有 secUid 形态才作为账号跨链路标识）。仅做字符串解析，不发请求。

### 4.2 聚合 key 规则（`aggregateProspectComments`）

评论路径：`userKey = secUidFromHomepage(comment.userHomepage) ?? (externalUserId ?? userNickname)`。需求帖作者路径无主页，维持 `author:<昵称>`。evidence 去重键随之使用新 userKey（同账号两条链路的评论在同一 prospect 下去重合并，天然消除重复 evidence）。

### 4.3 存量合并（`packages/database` 新增 `mergeDuplicateProspectCandidates(db, taskId)`）

1. 取该任务全部行，按 `secUidFromHomepage(userHomepage)` 分组，仅处理组内行数 > 1 的组。
2. 幸存行选择：优先有 `customerId` 的行；其次 `userKey` 为数字 UID 的行（平台稳定 ID，转客户 `platformUserKey` 引用数字 UID）；再取评分最高者。
3. 合并字段：`evidence = mergeProspectEvidence(并集)`、`commentCount = 合并后 evidence 长度`、评分四件套（`relevanceScore/leadLevel/scoreSource/intent/summary/matchedKeywords/buyingStage/confidence/riskFlags`）取评分最高行、`attributions` 用 `mergeProspectAttributions`、`userNickname/userHomepage/avatarUrl/externalUserId` 非空互补、`content` 取评分最高行、`customerId` 非空互补、`createdAt` 取最早。
4. 在事务中更新幸存行并物理删除其余行（该表无软删除列；被删行如已转客户则必须由其承载 customerId，规则 2 已保证）。幂等：重复执行无操作。

### 4.4 落库尾部自动合并

`persistProspects`（`packages/database/src/prospecting.ts`）在批次 upsert 完成后调用 `mergeDuplicateProspectCandidates(db, taskId)`，保证任务数据始终合并态。

### 4.5 双键匹配

- existing 行索引：`byUserKey` 之外增 `bySecUid`（行主页提取）；查找顺序 userKey → secUid。
- 30 天跨任务抑制（`filterPreviouslySeenProspects` 的数据源）：最近行同时收集 `userKey` 与 secUid，新批次按两个键判重。

## 5. API

`GET /api/prospecting/tasks/:id/candidates` 新增 Query 参数：

| 参数 | 取值 | 默认 | 说明 |
| --- | --- | --- | --- |
| `sort` | `relevance` \| `latest` | `relevance` | `relevance` = 相关度降序、id 升序（现状）；`latest` = `createdAt` 降序、id 降序兜底 |

深链 `focusId` 排名计算与列表 `orderBy` 使用同一排序规则。非法取值 400。

## 6. UI

`ProspectFilterBar` 增加「排序」下拉：相关度优先（默认）/ 最新优先；选择后列表刷新且保留其他筛选；分页/深链行为不变。

## 7. 验收标准

1. 单测：`secUidFromHomepage` 边界（secUid 形态 / 数字段 / 空串 / null / 带查询串）；聚合函数中同账号"结构化数字评论 + DOM secUid 评论（同一主页）"合并为一条、evidence 去重。
2. 集成：`sort=latest` 返回 createdAt 降序、`sort=relevance` 维持现状、非法值 400；`focusId` 在 `latest` 下定位正确页。
3. 集成：同任务造两行（数字 key / secUid key、同主页、一行带 customerId），执行合并后仅剩一行、evidence 并集、customerId 保留、幂等。
4. Web：筛选栏排序切换生效。
5. 存量回填：对当前库执行一次合并，输出合并前后行数（183 行基线），同一主页成对行清零。

## 8. 测试矩阵

| 层 | 文件 | 覆盖 |
| --- | --- | --- |
| shared 单测 | `tests/unit/shared/prospect-merge.test.ts` | secUid 提取边界；双链路聚合合并 |
| 集成 | `tests/integration/api/prospecting-candidates-sort.test.ts` | sort 参数三种路径 + focusId 深链 |
| 集成 | `tests/integration/prospect-merge.test.ts` | 合并函数字段规则、customerId 保留、幂等 |
| Web 单测 | 扩展 `tests/web/unit/prospect-filter-bar.test.tsx` | 排序下拉渲染与回调 |
