import type {
  InteractionConnector,
  InteractionCapabilities,
  PlatformComment,
  PlatformMessage,
  ReplyResult,
  PlatformCode
} from './types.js';

export class ManualImportConnector implements InteractionConnector {
  readonly platform: PlatformCode;

  constructor(platform: PlatformCode) {
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
      supportedModes: ['manual_import']
    };
  }

  async fetchComments(): Promise<PlatformComment[]> {
    return [];
  }

  async fetchMessages(): Promise<PlatformMessage[]> {
    return [];
  }

  async replyComment(): Promise<ReplyResult> {
    return {
      success: false,
      errorCode: 'MANUAL_ONLY',
      errorMessage: 'This platform only supports manual import'
    };
  }

  async replyMessage(): Promise<ReplyResult> {
    return {
      success: false,
      errorCode: 'MANUAL_ONLY',
      errorMessage: 'This platform only supports manual import'
    };
  }
}
