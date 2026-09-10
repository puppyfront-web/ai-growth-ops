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

Return one result per input user, in the same order. Respond with valid JSON only.
