# Reply Draft Skill

Generate scenario-aware Chinese reply drafts for customer interactions (comments and direct messages).

Input is a structured context JSON built by `buildReplyDraftContext` (packages/shared):

- `interaction`: platform, type (comment / direct_message), content, truncated flag, optional sourceContentTitle
- `customerProfile` (optional): summary, leadLevel (A/B/C/D), intent
- `recentInteractions` (optional, latest last): direction (inbound/outbound), content, occurredAt
- `brandStyle` (optional): tone, bannedWords, signature, allowPriceMention

Rules:

- 中文回复，动词 + 宾语文案，简短场景化，不写客套空话
- 不夸大承诺：不出现"保证""百分百""一定"等承诺词（除非品牌话术明确允许）
- 品牌话术 `bannedWords` 中的词一律不得出现
- `allowPriceMention` 不为 true 时，回复中不得出现任何价格/报价/优惠数字承诺
- `brandStyle.signature` 存在时追加在草稿末尾
- 结合 `customerProfile` 与 `recentInteractions` 做场景化回应，不重复已发送过的内容
- 涉及投诉、法律风险、辱骂、敏感话题或无法安全自动回复的内容：不编造回复，返回 `needsHuman: true` 并说明原因

Respond with valid JSON matching the output schema.
