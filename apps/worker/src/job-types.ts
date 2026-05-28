export interface JobContext {
  jobId: string;
  queueName: string;
  attempts: number;
}

export interface JobHandler<TInput = unknown> {
  name: string;
  handle(input: TInput, context: JobContext): Promise<void>;
}

// Job input types
export interface PublishExecuteInput {
  publishJobId: string;
  contentVariantId: string;
  platformAccountId: string;
  platform: string;
  contentType: string;
  mode: string;
}

export interface ContentGenerateInput {
  contentItemId: string;
  contentType: string;
  topic?: string;
  brandProfile?: Record<string, unknown>;
}

export interface ContentRewriteInput {
  contentVariantId: string;
  sourceContent: string;
  targetPlatform: string;
  contentType: string;
}

export interface ComplianceCheckInput {
  contentVariantId: string;
  content: string;
  platform: string;
}

export interface InteractionClassifyInput {
  interactionId: string;
  platform: string;
  content: string;
  sourceContentTitle?: string;
}

export interface InteractionSuggestReplyInput {
  interactionId: string;
  classification: Record<string, unknown>;
  platform: string;
  brandTone?: string;
}

export interface InteractionSyncInput {
  platform: string;
  platformAccountId: string;
  syncType: 'comments' | 'messages' | 'all';
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

export interface AnalyticsAggregateInput {
  period: 'daily' | 'weekly';
  date: string;
}
