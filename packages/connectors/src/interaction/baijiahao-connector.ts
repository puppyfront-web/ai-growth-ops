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

interface BaijiahaoCommentItem {
  comment_id: string;
  content: string;
  create_time: string;
  user_name?: string;
  user_id?: string;
  like_num?: number;
  reply_num?: number;
}

interface BaijiahaoCommentResponse {
  data?: {
    list?: BaijiahaoCommentItem[];
  };
  errno?: number;
  errmsg?: string;
}

interface BaijiahaoReplyResponse {
  data?: {
    reply_id?: string;
  };
  errno?: number;
  errmsg?: string;
}

export class BaijiahaoConnector implements InteractionConnector {
  readonly platform: PlatformCode = 'baijiahao';
  private config: InteractionConnectorConfig;

  constructor(config: InteractionConnectorConfig) {
    this.config = config;
  }

  async getCapabilities(): Promise<InteractionCapabilities> {
    return {
      platform: 'baijiahao',
      fetchComments: 'limited',
      fetchMessages: false,
      replyComments: 'limited',
      replyMessages: false,
      webhookSupported: false,
      pollingSupported: true,
      browserAssistSupported: true,
      manualImportSupported: true,
      autoReplyAllowed: false,
      requiresHumanReviewForMessageReply: true,
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

    const page = cursor ? Number(cursor) : 1;
    const appId = this.config.appId ?? '';
    const params = new URLSearchParams({
      app_id: appId,
      item_id: sourceContentId,
      pn: String(page),
      rn: String(limit),
    });

    const url = `https://baijiahao.baidu.com/builderinner/api/content/comment/list?${params.toString()}`;
    const headers = { Cookie: this.config.cookie };

    const resp = await platformGet<BaijiahaoCommentResponse>(url, headers);
    if (!resp.success || !resp.data?.data?.list) {
      return [];
    }

    return resp.data.data.list.map((item): PlatformComment => ({
      externalCommentId: item.comment_id ?? '',
      externalUserId: item.user_id ?? '',
      userNickname: item.user_name ?? '',
      content: item.content ?? '',
      likeCount: item.like_num,
      replyCount: item.reply_num,
      publishedAt: item.create_time ?? '',
      sourceContentId,
      rawPayload: item as unknown as Record<string, unknown>,
    }));
  }

  async fetchMessages(_input: FetchMessagesInput): Promise<PlatformMessage[]> {
    return [];
  }

  async replyComment(input: ReplyCommentInput): Promise<ReplyResult> {
    if (!this.config.cookie) {
      return { success: false, errorCode: 'NO_COOKIE', errorMessage: 'Missing cookie' };
    }

    const { externalCommentId, replyText } = input;
    const appId = this.config.appId ?? '';

    const url = 'https://baijiahao.baidu.com/builderinner/api/content/comment/reply';
    const headers = { Cookie: this.config.cookie };
    const body = {
      comment_id: externalCommentId,
      content: replyText,
      app_id: appId,
    };

    const resp = await platformPost<BaijiahaoReplyResponse>(url, body, headers);
    if (!resp.success) {
      return { success: false, errorCode: 'API_ERROR', errorMessage: resp.errorMessage };
    }

    const errno = resp.data?.errno;
    if (errno !== undefined && errno !== 0) {
      return {
        success: false,
        errorCode: String(errno),
        errorMessage: resp.data?.errmsg ?? 'Unknown Baijiahao API error',
      };
    }

    return {
      success: true,
      externalReplyId: resp.data?.data?.reply_id,
    };
  }

  async replyMessage(_input: ReplyMessageInput): Promise<ReplyResult> {
    return { success: false, errorCode: 'UNSUPPORTED', errorMessage: 'Baijiahao does not support messaging' };
  }
}
