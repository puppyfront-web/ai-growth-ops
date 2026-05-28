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
import { platformGet, platformPost } from './http-client.js';

interface WechatCommentItem {
  user_open_id: string;
  comment_id: number;
  content: string;
  create_time: number;
  reply?: { content: string };
}

interface WechatCommentListResponse {
  errcode: number;
  errmsg?: string;
  commentlist?: WechatCommentItem[];
  total?: number;
}

interface WechatCommonResponse {
  errcode: number;
  errmsg: string;
}

interface WechatTokenResponse {
  access_token: string;
  expires_in: number;
  errcode?: number;
  errmsg?: string;
}

export class WechatOfficialConnector implements InteractionConnector {
  readonly platform: PlatformCode = 'wechat_official';
  private config: InteractionConnectorConfig;

  constructor(config: InteractionConnectorConfig) {
    this.config = config;
  }

  async getCapabilities(): Promise<InteractionCapabilities> {
    return {
      platform: 'wechat_official',
      fetchComments: true,
      fetchMessages: true,
      replyComments: 'limited',
      replyMessages: true,
      webhookSupported: true,
      pollingSupported: true,
      browserAssistSupported: false,
      manualImportSupported: true,
      autoReplyAllowed: 'low_risk_only',
      requiresHumanReviewForMessageReply: false,
      requiresHumanReviewForLeadLevelA: true,
      supportedModes: ['official_api', 'webhook', 'manual_import', 'sandbox'],
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

    const url = `https://api.weixin.qq.com/cgi-bin/comment/list?access_token=${accessToken}`;
    const begin = cursor ? parseInt(cursor, 10) : 0;
    const count = limit ?? 50;

    const result = await platformPost<WechatCommentListResponse>(url, {
      msg_data_id: sourceContentId,
      index: 0,
      begin,
      count,
      type: 0,
    });

    if (!result.success || !result.data) {
      return [];
    }

    const data = result.data;
    if (data.errcode !== 0) {
      return [];
    }

    const comments = data.commentlist ?? [];
    return comments.map((c) => ({
      externalCommentId: String(c.comment_id),
      externalUserId: c.user_open_id ?? '',
      userNickname: c.user_open_id ?? '',
      content: c.content,
      publishedAt: new Date(c.create_time * 1000).toISOString(),
      sourceContentId,
      rawPayload: c as unknown as Record<string, unknown>,
    }));
  }

  async fetchMessages(_input: FetchMessagesInput): Promise<PlatformMessage[]> {
    // WeChat Official messages arrive via webhook (XML POST to the server endpoint).
    // There is no polling API for message history. The customer service typing API
    // (cgi-bin/message/custom/typing) only sends a typing indicator, it does not
    // retrieve messages. Return an empty array and rely on webhook mode instead.
    return [];
  }

  async replyComment(input: ReplyCommentInput): Promise<ReplyResult> {
    const accessToken = this.config.accessToken;
    if (!accessToken) {
      return { success: false, errorCode: 'NO_ACCESS_TOKEN', errorMessage: 'WeChat access_token is not configured' };
    }

    const { externalCommentId, replyText, sourceContentId } = input;
    if (!sourceContentId) {
      return { success: false, errorCode: 'MISSING_SOURCE_CONTENT_ID', errorMessage: 'sourceContentId is required to reply to a WeChat comment' };
    }

    const url = `https://api.weixin.qq.com/cgi-bin/comment/reply?access_token=${accessToken}`;
    const result = await platformPost<WechatCommonResponse>(url, {
      msg_data_id: sourceContentId,
      index: 0,
      comment_id: Number(externalCommentId),
      content: replyText,
    });

    if (!result.success || !result.data) {
      return { success: false, errorCode: 'HTTP_ERROR', errorMessage: result.errorMessage ?? 'HTTP request failed' };
    }

    if (result.data.errcode !== 0) {
      return {
        success: false,
        errorCode: String(result.data.errcode),
        errorMessage: result.data.errmsg ?? 'WeChat API returned an error',
      };
    }

    return { success: true };
  }

  async replyMessage(input: ReplyMessageInput): Promise<ReplyResult> {
    const accessToken = this.config.accessToken;
    if (!accessToken) {
      return { success: false, errorCode: 'NO_ACCESS_TOKEN', errorMessage: 'WeChat access_token is not configured' };
    }

    const { externalUserId, messageText } = input;
    const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`;

    const result = await platformPost<WechatCommonResponse>(url, {
      touser: externalUserId,
      msgtype: 'text',
      text: { content: messageText },
    });

    if (!result.success || !result.data) {
      return { success: false, errorCode: 'HTTP_ERROR', errorMessage: result.errorMessage ?? 'HTTP request failed' };
    }

    if (result.data.errcode !== 0) {
      return {
        success: false,
        errorCode: String(result.data.errcode),
        errorMessage: result.data.errmsg ?? 'WeChat API returned an error',
      };
    }

    return { success: true };
  }

  /**
   * Refresh the access_token using client_credential grant.
   * Call this when the current token is expired (errcode 42001).
   */
  async refreshAccessToken(): Promise<{ success: boolean; accessToken?: string; errorMessage?: string }> {
    const { appId, appSecret } = this.config;
    if (!appId || !appSecret) {
      return { success: false, errorMessage: 'appId and appSecret are required to refresh the access_token' };
    }

    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
    const result = await platformGet<WechatTokenResponse>(url, {});

    if (!result.success || !result.data) {
      return { success: false, errorMessage: result.errorMessage ?? 'HTTP request failed' };
    }

    const data = result.data;
    if (data.errcode) {
      return { success: false, errorMessage: `[${data.errcode}] ${data.errmsg ?? 'Token refresh failed'}` };
    }

    this.config.accessToken = data.access_token;
    return { success: true, accessToken: data.access_token };
  }
}
