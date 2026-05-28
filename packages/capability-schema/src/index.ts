export const CAPABILITIES = {
  PUBLISH_VIDEO: 'publish.video',
  PUBLISH_ARTICLE: 'publish.article',
  PUBLISH_NOTE: 'publish.note',
  FETCH_COMMENTS: 'interaction.fetch_comments',
  FETCH_MESSAGES: 'interaction.fetch_messages',
  REPLY_COMMENT: 'interaction.reply_comment',
  REPLY_MESSAGE: 'interaction.reply_message',
  LEAD_EXTRACT: 'lead.extract',
  AUTH_CHECK: 'auth.check',
  AUTH_LOGIN: 'auth.login',
  SKILL_HEALTHCHECK: 'skill.healthcheck',
} as const;

export type CapabilityName = typeof CAPABILITIES[keyof typeof CAPABILITIES];
