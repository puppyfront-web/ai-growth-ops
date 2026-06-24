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
  ReplyResult
} from './types.js';
import { fetchWithTimeout } from './http-client.js';

export class BrowserAssistInteractionConnector implements InteractionConnector {
  readonly platform: PlatformCode;
  private readonly cookie: string;
  private readonly headed: boolean | undefined;
  private readonly runnerUrl: string;

  constructor(platform: PlatformCode, config: InteractionConnectorConfig) {
    this.platform = platform;
    this.cookie = config.cookie ?? '';
    this.headed = config.headed;
    this.runnerUrl = process.env.BROWSER_RUNNER_URL || 'http://localhost:3200';
  }

  async getCapabilities(): Promise<InteractionCapabilities> {
    return {
      platform: this.platform,
      // Monitoring (fetch) is reliable: douyin web comment/message list APIs
      // work with cookie auth and no DOM scraping.
      fetchComments: true,
      fetchMessages: true,
      // Replies via browser automation are best-effort only: douyin's web
      // comment-publish API is gated by an X-Bogus/a_bogus signature that
      // changes frequently, and the creator-center reply pages have been
      // deprecated. Reliable auto-reply requires the official_api mode
      // (access_token → open.douyin.com /comment/reply/). Mark 'limited' so
      // callers know to require human review rather than trust silent sends.
      replyComments: 'limited',
      replyMessages: 'limited',
      webhookSupported: false,
      pollingSupported: true,
      browserAssistSupported: true,
      manualImportSupported: false,
      autoReplyAllowed: 'low_risk_only' as const,
      requiresHumanReviewForMessageReply: true,
      requiresHumanReviewForLeadLevelA: true,
      supportedModes: ['browser_assist']
    };
  }

  async fetchComments(input: FetchCommentsInput): Promise<PlatformComment[]> {
    const resp = await fetchWithTimeout(
      `${this.runnerUrl}/assist/fetch-comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: this.platform,
          cookie: this.cookie,
          sourceContentId: input.sourceContentId,
          cursor: input.cursor,
          limit: input.limit,
          headed: input.headed ?? this.headed
        })
      },
      180_000
    );
    const payload = (await resp.json()) as
      | Array<Record<string, unknown>>
      | Record<string, unknown>;
    if (!resp.ok || !Array.isArray(payload)) {
      const detail =
        (!Array.isArray(payload) && (payload.details as string | undefined)) ||
        (!Array.isArray(payload) && (payload.error as string | undefined)) ||
        `browser-assist comment fetch failed with status ${resp.status}`;
      throw new Error(detail);
    }
    const data = payload;
    return data.map((item) => ({
      externalCommentId: String(item.externalCommentId ?? ''),
      externalUserId: String(item.externalUserId ?? ''),
      userNickname: String(item.userNickname ?? ''),
      content: String(item.content ?? ''),
      likeCount: item.likeCount ? Number(item.likeCount) : undefined,
      replyCount: item.replyCount ? Number(item.replyCount) : undefined,
      publishedAt: String(item.publishedAt ?? new Date().toISOString()),
      sourceContentId: item.sourceContentId
        ? String(item.sourceContentId)
        : undefined,
      sourceContentTitle: item.sourceContentTitle
        ? String(item.sourceContentTitle)
        : undefined,
      rawPayload: item.rawPayload as Record<string, unknown> | undefined
    }));
  }

  async fetchMessages(input: FetchMessagesInput): Promise<PlatformMessage[]> {
    const resp = await fetchWithTimeout(
      `${this.runnerUrl}/assist/fetch-messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: this.platform,
          cookie: this.cookie,
          cursor: input.cursor,
          limit: input.limit,
          headed: input.headed ?? this.headed
        })
      },
      180_000
    );
    const payload = (await resp.json()) as
      | Array<Record<string, unknown>>
      | Record<string, unknown>;
    if (!resp.ok || !Array.isArray(payload)) {
      const detail =
        (!Array.isArray(payload) && (payload.details as string | undefined)) ||
        (!Array.isArray(payload) && (payload.error as string | undefined)) ||
        `browser-assist message fetch failed with status ${resp.status}`;
      throw new Error(detail);
    }
    const data = payload;
    return data.map((item) => ({
      externalMessageId: String(item.externalMessageId ?? ''),
      externalUserId: String(item.externalUserId ?? ''),
      userNickname: String(item.userNickname ?? ''),
      content: String(item.content ?? ''),
      type: (item.type as PlatformMessage['type']) ?? 'text',
      publishedAt: String(item.publishedAt ?? new Date().toISOString()),
      rawPayload: item.rawPayload as Record<string, unknown> | undefined
    }));
  }

  async replyComment(input: ReplyCommentInput): Promise<ReplyResult> {
    const resp = await fetchWithTimeout(
      `${this.runnerUrl}/assist/reply-comment`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: this.platform,
          cookie: this.cookie,
          externalCommentId: input.externalCommentId,
          replyText: input.replyText,
          sourceContentId: input.sourceContentId
        })
      }
    );
    return resp.json() as Promise<ReplyResult>;
  }

  async replyMessage(input: ReplyMessageInput): Promise<ReplyResult> {
    const resp = await fetchWithTimeout(
      `${this.runnerUrl}/assist/reply-message`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: this.platform,
          cookie: this.cookie,
          externalUserId: input.externalUserId,
          messageText: input.messageText
        })
      }
    );
    return resp.json() as Promise<ReplyResult>;
  }
}
