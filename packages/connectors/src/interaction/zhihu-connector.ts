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

interface ZhihuCommentItem {
  id: string;
  content: string;
  created_time: number;
  author?: { id?: string; name?: string };
  vote_count?: number;
  child_comment_count?: number;
}

interface ZhihuCommentResponse {
  data?: ZhihuCommentItem[];
}

interface ZhihuMessageItem {
  id: string;
  content?: string;
  sender?: { id?: string; name?: string };
  created_time?: number;
  type?: string;
}

interface ZhihuMessageResponse {
  data?: ZhihuMessageItem[];
}

interface ZhihuReplyResponse {
  id?: string;
  error?: { code?: number; message?: string };
}

const ZHIHU_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class ZhihuConnector implements InteractionConnector {
  readonly platform: PlatformCode = 'zhihu';
  private config: InteractionConnectorConfig;

  constructor(config: InteractionConnectorConfig) {
    this.config = config;
  }

  async getCapabilities(): Promise<InteractionCapabilities> {
    return {
      platform: 'zhihu',
      fetchComments: 'limited',
      fetchMessages: true,
      replyComments: 'limited',
      replyMessages: true,
      webhookSupported: false,
      pollingSupported: true,
      browserAssistSupported: true,
      manualImportSupported: true,
      autoReplyAllowed: 'low_risk_only',
      requiresHumanReviewForMessageReply: false,
      requiresHumanReviewForLeadLevelA: true,
      supportedModes: ['official_api', 'browser_assist', 'manual_import', 'sandbox'],
    };
  }

  async fetchComments(input: FetchCommentsInput): Promise<PlatformComment[]> {
    if (!this.config.cookie) {
      return [];
    }

    const { sourceContentId, cursor, limit = 20 } = input;
    if (!sourceContentId) {
      return [];
    }

    const params = new URLSearchParams({
      limit: String(limit),
    });
    if (cursor) {
      params.set('offset', cursor);
    }

    const url = `https://www.zhihu.com/api/v4/comment_v5/comments/${sourceContentId}?${params.toString()}`;
    const headers: Record<string, string> = {
      Cookie: this.config.cookie,
      'User-Agent': ZHIHU_UA,
    };

    const resp = await platformGet<ZhihuCommentResponse>(url, headers);
    if (!resp.success || !resp.data?.data) {
      return [];
    }

    return resp.data.data.map((item): PlatformComment => ({
      externalCommentId: String(item.id ?? ''),
      externalUserId: String(item.author?.id ?? ''),
      userNickname: item.author?.name ?? '',
      content: item.content ?? '',
      likeCount: item.vote_count,
      replyCount: item.child_comment_count,
      publishedAt: item.created_time ? new Date(item.created_time * 1000).toISOString() : '',
      sourceContentId,
      rawPayload: item as unknown as Record<string, unknown>,
    }));
  }

  async fetchMessages(input: FetchMessagesInput): Promise<PlatformMessage[]> {
    if (!this.config.cookie) {
      return [];
    }

    const { cursor, limit = 20 } = input;
    const params = new URLSearchParams({
      limit: String(limit),
    });
    if (cursor) {
      params.set('offset', cursor);
    }

    const url = `https://www.zhihu.com/api/v4/messages?${params.toString()}`;
    const headers: Record<string, string> = {
      Cookie: this.config.cookie,
      'User-Agent': ZHIHU_UA,
    };

    const resp = await platformGet<ZhihuMessageResponse>(url, headers);
    if (!resp.success || !resp.data?.data) {
      return [];
    }

    return resp.data.data.map((item): PlatformMessage => ({
      externalMessageId: String(item.id ?? ''),
      externalUserId: String(item.sender?.id ?? ''),
      userNickname: item.sender?.name ?? '',
      content: item.content ?? '',
      type: mapZhihuMessageType(item.type),
      publishedAt: item.created_time ? new Date(item.created_time * 1000).toISOString() : '',
      rawPayload: item as unknown as Record<string, unknown>,
    }));
  }

  async replyComment(input: ReplyCommentInput): Promise<ReplyResult> {
    if (!this.config.cookie) {
      return { success: false, errorCode: 'NO_COOKIE', errorMessage: 'Missing cookie' };
    }

    const { externalCommentId, replyText } = input;
    const url = 'https://www.zhihu.com/api/v4/comments';
    const headers: Record<string, string> = {
      Cookie: this.config.cookie,
      'User-Agent': ZHIHU_UA,
    };
    const body = {
      content: replyText,
      comment_type: 'reply',
      reply_comment_id: externalCommentId,
    };

    const resp = await platformPost<ZhihuReplyResponse>(url, body, headers);
    if (!resp.success) {
      return { success: false, errorCode: 'API_ERROR', errorMessage: resp.errorMessage };
    }

    if (resp.data?.error) {
      return {
        success: false,
        errorCode: String(resp.data.error.code ?? 'UNKNOWN'),
        errorMessage: resp.data.error.message ?? 'Unknown Zhihu API error',
      };
    }

    return {
      success: true,
      externalReplyId: resp.data?.id ? String(resp.data.id) : undefined,
    };
  }

  async replyMessage(input: ReplyMessageInput): Promise<ReplyResult> {
    if (!this.config.cookie) {
      return { success: false, errorCode: 'NO_COOKIE', errorMessage: 'Missing cookie' };
    }

    const { externalUserId, messageText } = input;
    const url = 'https://www.zhihu.com/api/v4/messages';
    const headers: Record<string, string> = {
      Cookie: this.config.cookie,
      'User-Agent': ZHIHU_UA,
    };
    const body = {
      receiver_id: externalUserId,
      content: messageText,
      type: 'common',
    };

    const resp = await platformPost<ZhihuReplyResponse>(url, body, headers);
    if (!resp.success) {
      return { success: false, errorCode: 'API_ERROR', errorMessage: resp.errorMessage };
    }

    if (resp.data?.error) {
      return {
        success: false,
        errorCode: String(resp.data.error.code ?? 'UNKNOWN'),
        errorMessage: resp.data.error.message ?? 'Unknown Zhihu API error',
      };
    }

    return {
      success: true,
      externalReplyId: resp.data?.id ? String(resp.data.id) : undefined,
    };
  }
}

function mapZhihuMessageType(type?: string): PlatformMessage['type'] {
  switch (type) {
    case 'text':
    case 'common':
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
