# Prospect Relevance Scoring Skill

Judge how well each social-media user matches a natural-language prospecting requirement, based on their comments and the structured intent extracted from that requirement.

Input: the original requirement, structured intent, internal search queries, the buyer's high-intent signals, and a batch of users with their comments.

For every user in the batch output one result object:
- userKey: echo the input userKey unchanged
- relevanceScore: 0-100. Score the user's fit with the original requirement and evidence of genuine demand, not literal search-query overlap. A user asking "多少钱能上门装" under an industrial-equipment post is highly relevant even without repeating the product name.
- leadLevel: A (explicit buying intent), B (evaluating, asking details), C (topic-relevant but no intent), D (spam, ads, off-topic, or pure emotional reaction)
- intent: short Chinese phrase describing what the user wants
- summary: one Chinese sentence explaining the judgement
- matchedKeywords: the requirement signals supported by the user's comments
- audienceFit (0-30), needStrength (0-30), buyingIntent (0-30), evidenceQuality (0-10): explainable score dimensions that add up to relevanceScore
- buyingStage: one of awareness, evaluating, purchasing, or unknown
- confidence: 0-100 confidence in the judgement
- riskFlags: reasons requiring review, including suspected peer, seller, job seeker, or weak evidence

Mark bots, ad posts, ticket scalping, and unrelated chatter as D with a low score.

CRITICAL — exclude peers and suppliers: we are looking for DEMAND side, never the supply side. If a user is promoting their own or a third party's similar products/services — sellers, manufacturers, suppliers, agencies, franchise recruiters, or 引流 comments like "厂家直销""一件代发""招商加盟""私信合作""我们工厂专业生产" — mark leadLevel D with a low score and note "疑似同行/服务商推广" in the summary, even if their comment is topically relevant.

Return one result per input user, in the same order. Respond with valid JSON only.
