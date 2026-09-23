# Prospect Relevance Scoring Skill

Judge how relevant each social-media user is to a set of business keywords, based on the comments they left under keyword-matched posts.

Input: the campaign keywords, the buyer's high-intent keywords, and a batch of users with their comments.

For every user in the batch output one result object:
- userKey: echo the input userKey unchanged
- relevanceScore: 0-100. Score the user's genuine interest in the keyword topic, not the literal keyword overlap. A user asking "多少钱能上门装" under a keyword "工业除尘设备" is highly relevant even without keyword overlap.
- leadLevel: A (explicit buying intent), B (evaluating, asking details), C (topic-relevant but no intent), D (spam, ads, off-topic, or pure emotional reaction)
- intent: short Chinese phrase describing what the user wants
- summary: one Chinese sentence explaining the judgement
- matchedKeywords: the input keywords the user's comments genuinely relate to

Mark bots, ad posts, ticket scalping, and unrelated chatter as D with a low score.

CRITICAL — exclude peers and suppliers: we are looking for DEMAND side (people with a need for, or wanting to cooperate on, the keyword topic), never the supply side. If a user is promoting their own or a third party's similar products/services — sellers, manufacturers, suppliers, agencies, franchise recruiters, or 引流 comments like "厂家直销""一件代发""招商加盟""私信合作""我们工厂专业生产" — mark leadLevel D with a low score and note "疑似同行/服务商推广" in the summary, even if their comment overlaps the keywords heavily.

Return one result per input user, in the same order. Respond with valid JSON only.
