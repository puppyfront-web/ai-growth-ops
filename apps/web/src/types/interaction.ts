import type { InteractionType, InteractionStatus, Platform } from './enums';

/** 会话/互动关联线索摘要（spec/53 T4，后端按 Lead.sourceInteractionId 反查） */
export type LeadSummary = {
  id: string;
  status: string;
  level: string;
  name: string | null;
  source: string;
  /** Lead 无独立评分字段，仅后端 metadata.score 存在时返回 */
  score?: number;
};

export type Conversation = {
  id: string;
  userId: string;
  platform: Platform;
  platformAccountId: string;
  externalUserId: string;
  externalUserName: string | null;
  status: InteractionStatus;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  metadata: unknown;
  /** Included by backend conversation detail endpoint */
  interactions: Interaction[];
  /** 关联线索摘要，无线索时后端不返回该字段 */
  leadSummary?: LeadSummary;
};

export type Interaction = {
  id: string;
  userId: string;
  platform: Platform;
  platformAccountId: string;
  conversationId: string | null;
  publishJobId: string | null;
  externalInteractionId: string;
  externalUserId: string;
  externalUserName: string | null;
  type: InteractionType;
  content: string;
  rawPayload: unknown;
  status: InteractionStatus;
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  metadata: unknown;
  /** Included by backend interactions list endpoint */
  conversation: Conversation | null;
  /** 关联线索摘要，无线索时后端不返回该字段 */
  leadSummary?: LeadSummary;
};

export type ReplySuggestion = {
  id: string;
  interactionId: string;
  suggestedReply: string;
  confidence: number;
  riskLevel: string;
  intentSummary: string;
  leadLevel: string;
  adopted: boolean;
};
