import type {
  InteractionConnector,
  InteractionConnectorConfig,
  PlatformCode,
  InteractionCapabilities,
  FetchCommentsInput,
  FetchMessagesInput,
  ReplyCommentInput,
  ReplyMessageInput,
  PlatformComment,
  PlatformMessage,
  ReplyResult,
} from './types.js';

export class BrowserAssistInteractionConnector implements InteractionConnector {
  readonly platform: PlatformCode;
  private readonly cookie: string;
  private readonly runnerUrl: string;

  constructor(platform: PlatformCode, config: InteractionConnectorConfig) {
    this.platform = platform;
    this.cookie = config.cookie ?? '';
    this.runnerUrl = process.env.BROWSER_RUNNER_URL || 'http://localhost:3200';
  }

  async getCapabilities(): Promise<InteractionCapabilities> {
    return {
      platform: this.platform,
      fetchComments: true,
      fetchMessages: true,
      replyComments: true,
      replyMessages: true,
      webhookSupported: false,
      pollingSupported: true,
      browserAssistSupported: true,
      manualImportSupported: false,
      autoReplyAllowed: 'low_risk_only' as const,
      requiresHumanReviewForMessageReply: true,
      requiresHumanReviewForLeadLevelA: true,
      supportedModes: ['browser_assist'],
    };
  }

  async fetchComments(input: FetchCommentsInput): Promise<PlatformComment[]> {
    const resp = await fetch(`${this.runnerUrl}/assist/fetch-comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: this.platform,
        cookie: this.cookie,
        sourceContentId: input.sourceContentId,
        cursor: input.cursor,
        limit: input.limit,
      }),
    });
    const data = await resp.json() as Array<Record<string, unknown>>;
    return data.map((item) => ({
      externalCommentId: String(item.externalCommentId ?? ''),
      externalUserId: String(item.externalUserId ?? ''),
      userNickname: String(item.userNickname ?? ''),
      content: String(item.content ?? ''),
      likeCount: item.likeCount ? Number(item.likeCount) : undefined,
      replyCount: item.replyCount ? Number(item.replyCount) : undefined,
      publishedAt: String(item.publishedAt ?? new Date().toISOString()),
      sourceContentId: item.sourceContentId ? String(item.sourceContentId) : undefined,
      sourceContentTitle: item.sourceContentTitle ? String(item.sourceContentTitle) : undefined,
      rawPayload: item.rawPayload as Record<string, unknown> | undefined,
    }));
  }

  async fetchMessages(input: FetchMessagesInput): Promise<PlatformMessage[]> {
    const resp = await fetch(`${this.runnerUrl}/assist/fetch-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: this.platform,
        cookie: this.cookie,
        cursor: input.cursor,
        limit: input.limit,
      }),
    });
    const data = await resp.json() as Array<Record<string, unknown>>;
    return data.map((item) => ({
      externalMessageId: String(item.externalMessageId ?? ''),
      externalUserId: String(item.externalUserId ?? ''),
      userNickname: String(item.userNickname ?? ''),
      content: String(item.content ?? ''),
      type: (item.type as PlatformMessage['type']) ?? 'text',
      publishedAt: String(item.publishedAt ?? new Date().toISOString()),
      rawPayload: item.rawPayload as Record<string, unknown> | undefined,
    }));
  }

  async replyComment(input: ReplyCommentInput): Promise<ReplyResult> {
    const resp = await fetch(`${this.runnerUrl}/assist/reply-comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: this.platform,
        cookie: this.cookie,
        externalCommentId: input.externalCommentId,
        replyText: input.replyText,
        sourceContentId: input.sourceContentId,
      }),
    });
    return resp.json() as Promise<ReplyResult>;
  }

  async replyMessage(input: ReplyMessageInput): Promise<ReplyResult> {
    const resp = await fetch(`${this.runnerUrl}/assist/reply-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: this.platform,
        cookie: this.cookie,
        externalUserId: input.externalUserId,
        messageText: input.messageText,
      }),
    });
    return resp.json() as Promise<ReplyResult>;
  }
}
