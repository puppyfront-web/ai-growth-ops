# Prospect Relevance Scoring Skill

Evaluate each social-media user in TWO steps: first decide WHO the user is (persona), then — only for genuine demand-side users — score how well they match the prospecting requirement. Never let topic relevance or industry vocabulary substitute for being the right kind of person.

Input: the original requirement, structured intent, internal search queries, the buyer's high-intent signals, and a batch of users with their comments.

## Step 1 — Persona classification (decide first, output personaTag)

For every user output one result object that starts with a personaTag, chosen from exactly:

- `demand_seeker` — 正在寻找/评估/计划引入所售服务的人。迹象：求助提问（怎么选/求推荐/多少钱/有没有做过的/能帮忙吗）、自述业务痛点并想改进（"我们产线老是漏检""客服接不过来"）、问价、要试用/演示/联系方式、吐槽现有人工流程想换方案。人称通常是"我们厂/我们店/我想给我们公司"。
- `peer_vendor` — 同行或服务方：推广自己或第三方的同类产品/服务，包括厂商、软件商、代理商、实施商、培训/课程方，以及软性引流（案例宣传、"我们专注XX十年"、"评论区留言领取"、教程导流、资源搬运号）。昵称/签名带"XX解决方案""XX科技""XX聊AI""接单/外包"等话术也算。
- `already_adopted` — 已经接入/落地了同类方案的企业或个人，在分享实施经验、晒效果、讨论用法或吐槽已购系统。他们没有采购需求，不是本次要找的客户。
- `practitioner` — 从业者/技术爱好者：聊技术细节、行业趋势、模型对比、职业发展，没有为自己业务寻找服务的诉求。
- `job_seeker` — 求职者：找 work、投简历、问岗位/薪资/实习。
- `irrelevant` — 无法判断或明显无关（水军、表情、纯情绪、跑题）。

判定依据（按优先级）：
1. 评论语气：求助提问 vs 经验陈述 vs 推广号召。疑问句+痛点 = 需求方；陈述句晒结果 = 已落地或从业者；号召关注/私信/领取 = 服务方。
2. 人称与主语："我们想/我们打算/我们厂缺" = 需求方；"我们做了/我们提供/我们专注/我们客户" = 已落地或服务方。
3. 昵称与签名话术（营销词、行业头衔、接单字样）。
4. 视频标题语境（在厂商宣传片下问价可能是中间商，需在 riskFlags 注明）。

不确定时宁可降级：证据不足以确认是 demand_seeker 就给更保守的画像，并在 riskFlags 写明缺什么证据。

## Step 2 — Scoring (only demand_seeker gets A/B/C)

For `demand_seeker`, output the full score:
- relevanceScore: 0-100, fit with the original requirement plus evidence of genuine demand — not literal search-query overlap. A user asking "多少钱能上门装" under an industrial-equipment post is highly relevant even without repeating the product name.
- leadLevel: A (explicit buying intent), B (evaluating, asking details), C (relevant pain/audience but no intent yet)
- intent: short Chinese phrase describing what the user wants
- summary: one Chinese sentence explaining persona + judgement
- matchedKeywords: the requirement signals supported by the user's comments
- audienceFit (0-30), needStrength (0-30), buyingIntent (0-30), evidenceQuality (0-10): explainable dimensions adding up to relevanceScore
- buyingStage: one of awareness, evaluating, purchasing, or unknown
- confidence: 0-100

For every NON-demand persona (`peer_vendor`, `already_adopted`, `practitioner`, `job_seeker`, `irrelevant`): leadLevel MUST be D, relevanceScore ≤ 25, and summary must state the persona reason in Chinese (e.g. "疑似同行/服务商推广""已落地分享经验，无采购需求""从业者聊技术，非需求方""疑似求职者""与需求无关"). Set the four dimensions near 0. This is mandatory even when the comments are highly on-topic — a peer discussing the exact offering is still a peer.

Mark bots, ad posts, ticket scalping, and unrelated chatter as `irrelevant` / D with a low score.

## Output contract

For every user in the batch output one result object, in the same input order:
- userKey: echo the input userKey unchanged
- personaTag: one of demand_seeker | peer_vendor | already_adopted | practitioner | job_seeker | irrelevant (required)
- relevanceScore, leadLevel, intent, summary, matchedKeywords, audienceFit, needStrength, buyingIntent, evidenceQuality, buyingStage, confidence
- riskFlags: Chinese reasons requiring review (e.g. "仅单条问价，身份未确认", "可能是中间商比价")

Respond with valid JSON only.
