export interface JobContext {
  jobId: string;
  queueName: string;
  attempts: number;
}

export interface JobHandler<TInput = unknown> {
  name: string;
  handle(input: TInput, context: JobContext): Promise<void>;
}

// ── Real job input types (6 active queues) ─────────────────────────

export interface PublishExecuteInput {
  publishJobId: string;
  contentVariantId: string;
  platformAccountId: string;
  platform: string;
  contentType: string;
  mode: string;
}

export interface InteractionSyncCommentsInput {
  userId: string;
  platformAccountId: string;
  platform: string;
  mode: string;
  headed?: boolean;
  sourceContentId?: string;
  cursor?: string;
  limit?: number;
  syncJobId?: string;
}

export interface InteractionSyncMessagesInput {
  userId: string;
  platformAccountId: string;
  platform: string;
  mode: string;
  headed?: boolean;
  cursor?: string;
  limit?: number;
  syncJobId?: string;
}

export interface ResearchRunInput {
  researchTaskId: string;
  platform: string;
  taskType: string;
  keywords?: string[];
  maxPosts?: number;
  maxComments?: number;
}

export interface LeadSyncInput {
  leadId: string;
  sinkType: string;
  sinkConfigId: string;
}
