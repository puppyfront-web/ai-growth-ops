import { Queue, QueueOptions } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connectionOptions: QueueOptions = {
  connection: {
    url: REDIS_URL
  }
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
  INTERACTION_SYNC_COMMENTS: 'interaction.sync_comments',
  INTERACTION_SYNC_MESSAGES: 'interaction.sync_messages',
  RESEARCH_RUN: 'research.run',
  LEAD_SYNC_FEISHU: 'lead.sync.feishu_bitable',
  LEAD_SYNC_WECOM: 'lead.sync.wecom_contact',
  CAMPAIGN_EXECUTE: 'campaign.execute',
  CAMPAIGN_CHECK_SCHEDULE: 'campaign.check-schedule',
  INTERACTION_AUTO_REPLY: 'interaction.auto-reply',
  INTERACTION_MANUAL_REPLY: 'interaction.manual-reply',
  SCHEDULED_INTERACTION_SYNC: 'scheduled.interaction-sync',
  WORKFLOW_EXECUTE: 'workflow.execute'
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
