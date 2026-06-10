import type {
  InteractionConnector,
  InteractionCapabilities,
  InteractionConnectorConfig,
  PlatformComment,
  PlatformMessage,
  ReplyResult,
  PlatformCode
} from './types.js';

export class DisabledInteractionConnector implements InteractionConnector {
  readonly platform: PlatformCode;

  constructor(platform: PlatformCode, _config?: InteractionConnectorConfig) {
    this.platform = platform;
  }

  async getCapabilities(): Promise<InteractionCapabilities> {
    return {
      platform: this.platform,
      fetchComments: false,
      fetchMessages: false,
      replyComments: false,
      replyMessages: false,
      webhookSupported: false,
      pollingSupported: false,
      browserAssistSupported: false,
      manualImportSupported: true,
      autoReplyAllowed: false,
      requiresHumanReviewForMessageReply: true,
      requiresHumanReviewForLeadLevelA: true,
      supportedModes: ['disabled']
    };
  }

  async fetchComments(): Promise<PlatformComment[]> {
    throw new Error(`Interaction connector for ${this.platform} is disabled`);
  }

  async fetchMessages(): Promise<PlatformMessage[]> {
    throw new Error(`Interaction connector for ${this.platform} is disabled`);
  }

  async replyComment(): Promise<ReplyResult> {
    return {
      success: false,
      errorCode: 'DISABLED',
      errorMessage: `Reply is disabled for ${this.platform}`
    };
  }

  async replyMessage(): Promise<ReplyResult> {
    return {
      success: false,
      errorCode: 'DISABLED',
      errorMessage: `Reply is disabled for ${this.platform}`
    };
  }
}
