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
import { platformGet, platformPost } from './http-client.js';
import { extractApiError } from '../error-utils.js';

interface DouyinCommentItem {
  comment_id: string;
  content: string;
  create_time: number;
  user?: { open_id?: string; nickname?: string };
  digg_count?: number;
  reply_comment_total?: number;
}

interface DouyinCommentResponse {
  data?: {
    list?: DouyinCommentItem[];
  };
}

interface DouyinMessageItem {
  message_id?: string;
  content?: string;
  from_user?: { open_id?: string; nickname?: string };
  create_time?: number;
  content_type?: string;
}

interface DouyinMessageResponse {
  data?: {
    list?: DouyinMessageItem[];
  };
}

interface DouyinReplyResponse {
  data?: {
    comment_id?: string;
  };
  status_code?: number;
  status_msg?: string;
}

export class DouyinConnector implements InteractionConnector {
  readonly platform: PlatformCode = 'douyin';
  private config: InteractionConnectorConfig;

  constructor(config: InteractionConnectorConfig) {
    this.config = config;
  }

  async getCapabilities(): Promise<InteractionCapabilities> {
    return {
      platform: 'douyin',
      fetchComments: true,
      fetchMessages: true,
      // Official API replies are stable (open.douyin.com /comment/reply/,
      // /im/message/send/ with Bearer access_token). This is the reliable
      // path; browser_assist replies are only 'limited'.
      replyComments: true,
      replyMessages: true,
      webhookSupported: false,
      pollingSupported: true,
      browserAssistSupported: false,
      manualImportSupported: true,
      autoReplyAllowed: 'low_risk_only',
      requiresHumanReviewForMessageReply: false,
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
    if (!this.config.accessToken) {
      return [];
    }

    const { sourceContentId, cursor, limit = 20 } = input;
    if (!sourceContentId) {
      return [];
    }

    const params = new URLSearchParams({
      item_id: sourceContentId,
      count: String(limit)
    });
    if (cursor) {
      params.set('cursor', cursor);
    }

    const url = `https://open.douyin.com/api/douyin/comment/list/?${params.toString()}`;
    const headers = { Authorization: `Bearer ${this.config.accessToken}` };

    const resp = await platformGet<DouyinCommentResponse>(url, headers);
    if (!resp.success || !resp.data?.data?.list) {
      return [];
    }

    return resp.data.data.list.map(
      (item): PlatformComment => ({
        externalCommentId: item.comment_id ?? '',
        externalUserId: item.user?.open_id ?? '',
        userNickname: item.user?.nickname ?? '',
        content: item.content ?? '',
        likeCount: item.digg_count,
        replyCount: item.reply_comment_total,
        publishedAt: item.create_time
          ? new Date(item.create_time * 1000).toISOString()
          : '',
        sourceContentId,
        rawPayload: item as unknown as Record<string, unknown>
      })
    );
  }

  async fetchMessages(input: FetchMessagesInput): Promise<PlatformMessage[]> {
    if (!this.config.accessToken) {
      return [];
    }

    const { platformAccountId, cursor, limit = 20 } = input;
    if (!platformAccountId) {
      return [];
    }

    const params = new URLSearchParams({
      conversation_id: platformAccountId,
      count: String(limit)
    });
    if (cursor) {
      params.set('cursor', cursor);
    }

    const url = `https://open.douyin.com/api/douyin/im/message/list/?${params.toString()}`;
    const headers = { Authorization: `Bearer ${this.config.accessToken}` };

    const resp = await platformGet<DouyinMessageResponse>(url, headers);
    if (!resp.success || !resp.data?.data?.list) {
      return [];
    }

    return resp.data.data.list.map(
      (item): PlatformMessage => ({
        externalMessageId: item.message_id ?? '',
        externalUserId: item.from_user?.open_id ?? '',
        userNickname: item.from_user?.nickname ?? '',
        content: item.content ?? '',
        type: mapDouyinMessageType(item.content_type),
        publishedAt: item.create_time
          ? new Date(item.create_time * 1000).toISOString()
          : '',
        rawPayload: item as unknown as Record<string, unknown>
      })
    );
  }

  async replyComment(input: ReplyCommentInput): Promise<ReplyResult> {
    if (!this.config.accessToken) {
      return {
        success: false,
        errorCode: 'NO_ACCESS_TOKEN',
        errorMessage: 'Missing access token'
      };
    }

    const { externalCommentId, replyText, sourceContentId } = input;
    if (!sourceContentId) {
      return {
        success: false,
        errorCode: 'MISSING_CONTENT_ID',
        errorMessage: 'sourceContentId is required'
      };
    }

    const url = 'https://open.douyin.com/api/douyin/comment/reply/';
    const headers = { Authorization: `Bearer ${this.config.accessToken}` };
    const body = {
      item_id: sourceContentId,
      comment_id: externalCommentId,
      content: replyText
    };

    const resp = await platformPost<DouyinReplyResponse>(url, body, headers);
    if (!resp.success) {
      return {
        success: false,
        errorCode: 'API_ERROR',
        errorMessage: resp.errorMessage
      };
    }

    const apiError = extractApiError(
      resp.data as Record<string, unknown>,
      'douyin'
    );
    if (apiError) {
      return {
        success: false,
        errorCode: apiError.code,
        errorMessage: apiError.message
      };
    }

    return {
      success: true,
      externalReplyId: resp.data?.data?.comment_id
    };
  }

  async replyMessage(input: ReplyMessageInput): Promise<ReplyResult> {
    if (!this.config.accessToken) {
      return {
        success: false,
        errorCode: 'NO_ACCESS_TOKEN',
        errorMessage: 'Missing access token'
      };
    }

    const { externalUserId, messageText } = input;
    const url = 'https://open.douyin.com/api/douyin/im/message/send/';
    const headers = { Authorization: `Bearer ${this.config.accessToken}` };
    const body = {
      to_open_id: externalUserId,
      content_type: 'text',
      content: JSON.stringify({ text: messageText })
    };

    const resp = await platformPost<DouyinReplyResponse>(url, body, headers);
    if (!resp.success) {
      return {
        success: false,
        errorCode: 'API_ERROR',
        errorMessage: resp.errorMessage
      };
    }

    const apiError = extractApiError(
      resp.data as Record<string, unknown>,
      'douyin'
    );
    if (apiError) {
      return {
        success: false,
        errorCode: apiError.code,
        errorMessage: apiError.message
      };
    }

    return {
      success: true,
      externalReplyId: resp.data?.data?.comment_id
    };
  }
}

function mapDouyinMessageType(contentType?: string): PlatformMessage['type'] {
  switch (contentType) {
    case 'text':
      return 'text';
    case 'image':
      return 'image';
    case 'voice':
      return 'voice';
    case 'link':
      return 'link';
    default:
      return 'other';
  }
}
