import type { InteractionType, InteractionStatus, Platform } from './enums';

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
