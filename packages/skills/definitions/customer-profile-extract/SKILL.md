# Customer Profile Extraction Skill

Extract structured customer profile from CRM fields and activity context. Works for cold-start customers without social interaction history.

Output a JSON object with:
- industry: inferred industry from company name (or null)
- companySize: estimated size if inferable (or null)
- painPoints: array of pain point strings
- interests: array of interest strings
- budget: budget signal if mentioned
- timeline: purchase timeline signal
- bant: { budget, authority, need, timeline }
- summary: one paragraph customer summary in Chinese
- tags: array of profile tags

Use the provided company, role, intent, channel and activities. Be conservative — only infer what the data supports.

Respond with valid JSON only.
