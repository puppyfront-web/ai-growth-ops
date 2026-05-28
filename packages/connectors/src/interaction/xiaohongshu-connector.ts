import type {
  InteractionConnector,
  InteractionCapabilities,
  InteractionConnectorConfig,
  PlatformCode,
  FetchCommentsInput,
  FetchMessagesInput,
  PlatformComment,
  PlatformMessage,
  ReplyCommentInput,
  ReplyMessageInput,
  ReplyResult,
} from './types.js';

export class XiaohongshuConnector implements InteractionConnector {
  readonly platform: PlatformCode = 'xiaohongshu';
  private config: InteractionConnectorConfig;

  constructor(config: InteractionConnectorConfig) {
    this.config = config;
  }

  async getCapabilities(): Promise<InteractionCapabilities> {
    return {
      platform: 'xiaohongshu',
      fetchComments: 'limited',
      fetchMessages: false,
      replyComments: 'limited',
      replyMessages: false,
      webhookSupported: false,
      pollingSupported: false,
      browserAssistSupported: true,
      manualImportSupported: true,
      autoReplyAllowed: false,
      requiresHumanReviewForMessageReply: true,
      requiresHumanReviewForLeadLevelA: true,
      supportedModes: ['browser_assist', 'manual_import', 'sandbox'],
    };
  }

  async fetchComments(_input: FetchCommentsInput): Promise<PlatformComment[]> {
    // No official polling API — returns empty so HybridConnector falls back to browser_assist
    return [];
  }

  async fetchMessages(_input: FetchMessagesInput): Promise<PlatformMessage[]> {
    // No official polling API — returns empty so HybridConnector falls back to browser_assist
    return [];
  }

  async replyComment(_input: ReplyCommentInput): Promise<ReplyResult> {
    return {
      success: false,
      errorCode: 'NO_OFFICIAL_API',
      errorMessage: 'Xiaohongshu comment reply requires browser_assist mode',
    };
  }

  async replyMessage(input: ReplyMessageInput): Promise<ReplyResult> {
    return { success: false, errorCode: 'UNSUPPORTED', errorMessage: 'Xiaohongshu does not support messaging' };
  }
}
