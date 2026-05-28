import { Queue, QueueOptions } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connectionOptions: QueueOptions = {
  connection: {
    url: REDIS_URL,
  },
};

const queues = new Map<string, Queue>();

export function getQueue(name: string): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, connectionOptions);
    queues.set(name, queue);
  }
  return queue;
}

export const QUEUE_NAMES = {
  PUBLISH_EXECUTE: 'publish.execute',
  PUBLISH_BROWSER_ASSIST: 'publish.browser_assist',
  PUBLISH_STATUS_FETCH: 'publish.status_fetch',
  CONTENT_GENERATE: 'content.generate',
  CONTENT_REWRITE: 'content.rewrite',
  CONTENT_COMPLIANCE_CHECK: 'content.compliance_check',
  INTERACTION_CLASSIFY: 'interaction.classify',
  INTERACTION_SUGGEST_REPLY: 'interaction.suggest_reply',
  INTERACTION_SYNC_COMMENTS: 'interaction.sync_comments',
  INTERACTION_SYNC_MESSAGES: 'interaction.sync_messages',
  RESEARCH_RUN: 'research.run',
  RESEARCH_COLLECT_POSTS: 'research.collect_posts',
  RESEARCH_COLLECT_COMMENTS: 'research.collect_comments',
  RESEARCH_GENERATE_INSIGHTS: 'research.generate_insights',
  LEAD_SYNC_FEISHU: 'lead.sync.feishu_bitable',
  LEAD_NOTIFY_FEISHU: 'lead.notify.feishu_bot',
  LEAD_SYNC_WECOM: 'lead.sync.wecom_contact',
  LEAD_NOTIFY_WECOM: 'lead.notify.wecom_app_message',
  ANALYTICS_AGGREGATE: 'analytics.aggregate',
  ANALYTICS_REPORT: 'analytics.report',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];
