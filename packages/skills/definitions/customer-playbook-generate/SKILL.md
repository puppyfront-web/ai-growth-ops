# Customer Playbook Generation Skill

Generate a personalized follow-up playbook for a single CRM customer based on profile, scores, and recent activities.

Output a JSON object with:
- summary: one sentence playbook overview in Chinese
- reasoning: brief rationale referencing segment and scores
- actions: array of 3-5 action objects, each with:
  - type: one of call, wecom_message, email, meeting, send_material, follow_up_note
  - title: short action title in Chinese
  - content: detailed execution guidance in Chinese
  - dueInDays: integer days from today (0 = today)
  - priority: high, medium, or low

Prioritize high-intent customers with calls and meetings; nurture cold leads with content. Be specific to the customer's company, role, intent, and pain points.

Respond with valid JSON only.
