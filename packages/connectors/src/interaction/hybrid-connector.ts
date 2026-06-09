import type {
  InteractionConnector,
  InteractionCapabilities,
  PlatformCode,
  FetchCommentsInput,
  FetchMessagesInput,
  PlatformComment,
  PlatformMessage,
  ReplyCommentInput,
  ReplyMessageInput,
  ReplyResult,
  MarkHandledInput,
  MarkHandledResult
} from './types.js';

/**
 * Tries the primary connector first; falls back to the secondary on error or
 * empty result.  Intended for "official API → browser-assist" chains where the
 * official API is preferred but not always available or authorised.
 */
export class HybridInteractionConnector implements InteractionConnector {
  readonly platform: PlatformCode;

  constructor(
    private readonly primary: InteractionConnector,
    private readonly fallback: InteractionConnector
  ) {
    this.platform = primary.platform;
  }

  async getCapabilities(): Promise<InteractionCapabilities> {
    const [primaryCaps, fallbackCaps] = await Promise.all([
      this.primary.getCapabilities(),
      this.fallback.getCapabilities()
    ]);

    return {
      platform: primaryCaps.platform,
      fetchComments: primaryCaps.fetchComments || fallbackCaps.fetchComments,
      fetchMessages: primaryCaps.fetchMessages || fallbackCaps.fetchMessages,
      replyComments: primaryCaps.replyComments || fallbackCaps.replyComments,
      replyMessages: primaryCaps.replyMessages || fallbackCaps.replyMessages,
      webhookSupported:
        primaryCaps.webhookSupported || fallbackCaps.webhookSupported,
      pollingSupported:
        primaryCaps.pollingSupported || fallbackCaps.pollingSupported,
      browserAssistSupported: fallbackCaps.browserAssistSupported,
      manualImportSupported:
        primaryCaps.manualImportSupported || fallbackCaps.manualImportSupported,
      autoReplyAllowed:
        primaryCaps.autoReplyAllowed || fallbackCaps.autoReplyAllowed,
      requiresHumanReviewForMessageReply:
        primaryCaps.requiresHumanReviewForMessageReply &&
        fallbackCaps.requiresHumanReviewForMessageReply,
      requiresHumanReviewForLeadLevelA:
        primaryCaps.requiresHumanReviewForLeadLevelA ||
        fallbackCaps.requiresHumanReviewForLeadLevelA,
      supportedModes: [
        ...new Set([
          ...primaryCaps.supportedModes,
          ...fallbackCaps.supportedModes
        ])
      ]
    };
  }

  async fetchComments(input: FetchCommentsInput): Promise<PlatformComment[]> {
    try {
      const results = await this.primary.fetchComments(input);
      if (results.length > 0) return results;
    } catch {
      // primary failed — fall through to browser-assist
    }
    return this.fallback.fetchComments(input);
  }

  async fetchMessages(input: FetchMessagesInput): Promise<PlatformMessage[]> {
    try {
      const results = await this.primary.fetchMessages(input);
      if (results.length > 0) return results;
    } catch {
      // primary failed — fall through to browser-assist
    }
    return this.fallback.fetchMessages(input);
  }

  async replyComment(input: ReplyCommentInput): Promise<ReplyResult> {
    const result = await this.primary.replyComment(input).catch(
      (err: unknown): ReplyResult => ({
        success: false,
        errorCode: 'PRIMARY_EXCEPTION',
        errorMessage: err instanceof Error ? err.message : String(err)
      })
    );
    if (result.success) return result;
    return this.fallback.replyComment(input);
  }

  async replyMessage(input: ReplyMessageInput): Promise<ReplyResult> {
    const result = await this.primary.replyMessage(input).catch(
      (err: unknown): ReplyResult => ({
        success: false,
        errorCode: 'PRIMARY_EXCEPTION',
        errorMessage: err instanceof Error ? err.message : String(err)
      })
    );
    if (result.success) return result;
    return this.fallback.replyMessage(input);
  }

  async markHandled(input: MarkHandledInput): Promise<MarkHandledResult> {
    if (this.primary.markHandled) {
      const result = await this.primary
        .markHandled(input)
        .catch(() => ({ success: false }));
      if (result.success) return result;
    }
    return this.fallback.markHandled?.(input) ?? { success: true };
  }
}
