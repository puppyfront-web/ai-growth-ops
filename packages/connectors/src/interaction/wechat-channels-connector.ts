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
  ReplyResult
} from './types.js';
import { platformPost } from './http-client.js';

interface WechatChannelsCommentItem {
  comment_id: string;
  content: string;
  create_time: number;
  username: string;
  openid: string;
  like_count: number;
}

interface WechatChannelsCommentListResponse {
  errcode: number;
  errmsg?: string;
  comments?: WechatChannelsCommentItem[];
  cursor?: string;
  total?: number;
}

interface WechatChannelsMessageItem {
  message_id: string;
  content: string;
  create_time: number;
  sender?: { openid: string; nickname: string };
  msg_type?: string;
}

interface WechatChannelsMessageListResponse {
  errcode: number;
  errmsg?: string;
  messages?: WechatChannelsMessageItem[];
  cursor?: string;
}

interface WechatChannelsCommonResponse {
  errcode: number;
  errmsg: string;
}

export class WechatChannelsConnector implements InteractionConnector {
  readonly platform: PlatformCode = 'wechat_channels';
  private config: InteractionConnectorConfig;

  constructor(config: InteractionConnectorConfig) {
    this.config = config;
  }

  async getCapabilities(): Promise<InteractionCapabilities> {
    return {
      platform: 'wechat_channels',
      fetchComments: 'limited',
      fetchMessages: 'limited',
      replyComments: false,
      replyMessages: 'limited',
      webhookSupported: false,
      pollingSupported: true,
      browserAssistSupported: true,
      manualImportSupported: true,
      autoReplyAllowed: false,
      requiresHumanReviewForMessageReply: true,
      requiresHumanReviewForLeadLevelA: true,
      supportedModes: [
        'official_api',
        'browser_assist',
        'manual_import',
        'sandbox'
      ]
    };
  }

  async fetchComments(input: FetchCommentsInput): Promise<PlatformComment[]> {
    const accessToken = this.config.accessToken;
    if (!accessToken) {
      return [];
    }

    const { sourceContentId, cursor, limit } = input;
    if (!sourceContentId) {
      return [];
    }

    const count = limit ?? 20;

    // Use the video/finder comment list API for Channels content
    const url = `https://api.weixin.qq.com/channels/finder/comment/list?access_token=${accessToken}`;
    const result = await platformPost<WechatChannelsCommentListResponse>(url, {
      feed_id: sourceContentId,
      cursor: cursor ?? '0',
      limit: count
    });

    if (!result.success || !result.data) {
      return [];
    }

    const data = result.data;
    if (data.errcode !== 0) {
      return [];
    }

    const comments = data.comments ?? [];
    return comments.map((c) => ({
      externalCommentId: String(c.comment_id),
      externalUserId: c.openid ?? '',
      userNickname: c.username ?? '',
      content: c.content,
      likeCount: c.like_count,
      publishedAt: new Date(c.create_time * 1000).toISOString(),
      sourceContentId,
      rawPayload: c as unknown as Record<string, unknown>
    }));
  }

  async fetchMessages(input: FetchMessagesInput): Promise<PlatformMessage[]> {
    const accessToken = this.config.accessToken;
    if (!accessToken) {
      return [];
    }

    const { platformAccountId, cursor, limit } = input;
    if (!platformAccountId) {
      return [];
    }

    const count = limit ?? 20;
    const url = `https://api.weixin.qq.com/channels/finder/contact/message/list?access_token=${accessToken}`;

    const result = await platformPost<WechatChannelsMessageListResponse>(url, {
      finder_username: platformAccountId,
      limit: count,
      cursor: cursor ?? ''
    });

    if (!result.success || !result.data) {
      return [];
    }

    const data = result.data;
    if (data.errcode !== 0) {
      return [];
    }

    const messages = data.messages ?? [];
    return messages.map((m) => ({
      externalMessageId: String(m.message_id),
      externalUserId: m.sender?.openid ?? '',
      userNickname: m.sender?.nickname ?? '',
      content: m.content,
      type: (m.msg_type === 'text'
        ? 'text'
        : 'other') as PlatformMessage['type'],
      publishedAt: new Date(m.create_time * 1000).toISOString(),
      rawPayload: m as unknown as Record<string, unknown>
    }));
  }

  async replyComment(_input: ReplyCommentInput): Promise<ReplyResult> {
    // WeChat Channels API does not support programmatic comment replies
    return {
      success: false,
      errorCode: 'UNSUPPORTED',
      errorMessage: 'WeChat Channels does not support comment replies via API'
    };
  }

  async replyMessage(input: ReplyMessageInput): Promise<ReplyResult> {
    const accessToken = this.config.accessToken;
    if (!accessToken) {
      return {
        success: false,
        errorCode: 'NO_ACCESS_TOKEN',
        errorMessage: 'WeChat access_token is not configured'
      };
    }

    const { platformAccountId, messageText } = input;
    if (!platformAccountId) {
      return {
        success: false,
        errorCode: 'MISSING_ACCOUNT_ID',
        errorMessage: 'platformAccountId (finder_username) is required'
      };
    }

    const url = `https://api.weixin.qq.com/channels/finder/contact/message/send?access_token=${accessToken}`;
    const result = await platformPost<WechatChannelsCommonResponse>(url, {
      finder_username: platformAccountId,
      content: messageText,
      msg_type: 'text'
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        errorCode: 'HTTP_ERROR',
        errorMessage: result.errorMessage ?? 'HTTP request failed'
      };
    }

    if (result.data.errcode !== 0) {
      return {
        success: false,
        errorCode: String(result.data.errcode),
        errorMessage:
          result.data.errmsg ?? 'WeChat Channels API returned an error'
      };
    }

    return { success: true };
  }
}
