export type PlatformCode =
  | 'douyin'
  | 'xiaohongshu'
  | 'wechat_official'
  | 'wechat_channels'
  | 'baijiahao'
  | 'zhihu';

export type InteractionMode =
  | 'official_api'
  | 'webhook'
  | 'browser_assist'
  | 'manual_import'
  | 'recorded'
  | 'sandbox'
  | 'disabled';

export type InteractionType =
  | 'comment'
  | 'comment_reply'
  | 'private_message'
  | 'official_account_message'
  | 'lead_form'
  | 'system_message'
  | 'manual_import';

export interface InteractionCapabilities {
  platform: PlatformCode;
  fetchComments: boolean | 'limited';
  fetchMessages: boolean | 'limited';
  replyComments: boolean | 'limited';
  replyMessages: boolean | 'limited';
  webhookSupported: boolean;
  pollingSupported: boolean;
  browserAssistSupported: boolean;
  manualImportSupported: boolean;
  autoReplyAllowed: boolean | 'low_risk_only';
  requiresHumanReviewForMessageReply: boolean;
  requiresHumanReviewForLeadLevelA: boolean;
  supportedModes: InteractionMode[];
}

export interface FetchCommentsInput {
  platformAccountId: string;
  sourceContentId?: string;
  cursor?: string;
  limit?: number;
  headed?: boolean;
}

export interface FetchMessagesInput {
  platformAccountId: string;
  cursor?: string;
  limit?: number;
  headed?: boolean;
}

export interface ReplyCommentInput {
  platformAccountId: string;
  externalCommentId: string;
  replyText: string;
  sourceContentId?: string;
}

export interface ReplyMessageInput {
  platformAccountId: string;
  externalUserId: string;
  messageText: string;
}

export interface PlatformComment {
  externalCommentId: string;
  externalUserId: string;
  userNickname: string;
  content: string;
  likeCount?: number;
  replyCount?: number;
  publishedAt: string;
  sourceContentId?: string;
  sourceContentTitle?: string;
  rawPayload?: Record<string, unknown>;
}

export interface PlatformMessage {
  externalMessageId: string;
  externalUserId: string;
  userNickname: string;
  content: string;
  type: 'text' | 'image' | 'voice' | 'link' | 'other';
  publishedAt: string;
  rawPayload?: Record<string, unknown>;
}

export interface ReplyResult {
  success: boolean;
  externalReplyId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface MarkHandledResult {
  success: boolean;
}

export interface MarkHandledInput {
  platformAccountId: string;
  externalInteractionId: string;
}

export interface InteractionConnector {
  readonly platform: PlatformCode;
  getCapabilities(): Promise<InteractionCapabilities>;
  fetchComments(input: FetchCommentsInput): Promise<PlatformComment[]>;
  fetchMessages(input: FetchMessagesInput): Promise<PlatformMessage[]>;
  replyComment(input: ReplyCommentInput): Promise<ReplyResult>;
  replyMessage(input: ReplyMessageInput): Promise<ReplyResult>;
  markHandled?(input: MarkHandledInput): Promise<MarkHandledResult>;
}

export interface InteractionConnectorConfig {
  mode: InteractionMode;
  accessToken?: string;
  refreshToken?: string;
  cookie?: string;
  headed?: boolean;
  appId?: string;
  appSecret?: string;
  webhookSecret?: string;
  customConfig?: Record<string, unknown>;
}
