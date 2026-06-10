import { platformPost } from './http-client.js';
import type { PlatformCode } from './types.js';

const RUNNER_URL = process.env.BROWSER_RUNNER_URL || 'http://localhost:3200';

export interface BrowserAssistConfig {
  cookie: string;
  platform: PlatformCode;
}

function requireArrayResponse(
  result: { success: boolean; data: unknown; errorMessage?: string },
  fetchType: 'comments' | 'messages'
): Record<string, unknown>[] {
  if (!result.success) {
    throw new Error(
      result.errorMessage || `browser-assist ${fetchType} request failed`
    );
  }
  if (!Array.isArray(result.data)) {
    const payload = result.data as Record<string, unknown> | null;
    const detail =
      (payload?.details as string | undefined) ||
      (payload?.error as string | undefined) ||
      `browser-assist ${fetchType} request returned an invalid payload`;
    throw new Error(detail);
  }
  return result.data;
}

export class BrowserAssistClient {
  private runnerUrl: string;

  constructor(runnerUrl?: string) {
    this.runnerUrl = runnerUrl || RUNNER_URL;
  }

  async fetchComments(
    config: BrowserAssistConfig,
    sourceContentId?: string,
    limit?: number,
    cursor?: string,
    headed?: boolean
  ): Promise<Record<string, unknown>[]> {
    const url = `${this.runnerUrl}/assist/fetch-comments`;
    const result = await platformPost<Record<string, unknown>[]>(
      url,
      {
        platform: config.platform,
        cookie: config.cookie,
        sourceContentId,
        limit: limit || 50,
        cursor,
        headed
      },
      {},
      180_000
    );
    return requireArrayResponse(result, 'comments');
  }

  async fetchMessages(
    config: BrowserAssistConfig,
    limit?: number,
    cursor?: string,
    headed?: boolean
  ): Promise<Record<string, unknown>[]> {
    const url = `${this.runnerUrl}/assist/fetch-messages`;
    const result = await platformPost<Record<string, unknown>[]>(
      url,
      {
        platform: config.platform,
        cookie: config.cookie,
        limit: limit || 50,
        cursor,
        headed
      },
      {},
      180_000
    );
    return requireArrayResponse(result, 'messages');
  }

  async replyComment(
    config: BrowserAssistConfig,
    externalCommentId: string,
    replyText: string,
    sourceContentId?: string
  ): Promise<{ success: boolean; externalReplyId?: string }> {
    const url = `${this.runnerUrl}/assist/reply-comment`;
    const result = await platformPost<{
      success: boolean;
      externalReplyId?: string;
    }>(url, {
      platform: config.platform,
      cookie: config.cookie,
      externalCommentId,
      replyText,
      sourceContentId
    });
    return result.data || { success: false };
  }

  async replyMessage(
    config: BrowserAssistConfig,
    externalUserId: string,
    messageText: string
  ): Promise<{ success: boolean; externalReplyId?: string }> {
    const url = `${this.runnerUrl}/assist/reply-message`;
    const result = await platformPost<{
      success: boolean;
      externalReplyId?: string;
    }>(url, {
      platform: config.platform,
      cookie: config.cookie,
      externalUserId,
      messageText
    });
    return result.data || { success: false };
  }

  /**
   * Search for a keyword on a platform, then fetch comments for the top N results.
   * Returns structured results with contentId, title, author, and comments per result.
   */
  async searchAndFetchComments(
    config: BrowserAssistConfig,
    keyword: string,
    topN = 3,
    headed?: boolean
  ): Promise<{
    keyword: string;
    results: Array<{
      contentId: string;
      title: string;
      author: string;
      comments: Array<Record<string, unknown>>;
    }>;
  }> {
    const url = `${this.runnerUrl}/assist/search-and-fetch-comments`;
    const result = await platformPost<Record<string, unknown>>(
      url,
      {
        platform: config.platform,
        cookie: config.cookie,
        keyword,
        topN,
        headed
      },
      {},
      180_000
    );
    if (!result.success) {
      const detail =
        (result.data as Record<string, unknown>)?.details ||
        result.errorMessage ||
        'search-and-fetch failed';
      throw new Error(String(detail));
    }
    return result.data as {
      keyword: string;
      results: Array<{
        contentId: string;
        title: string;
        author: string;
        comments: Array<Record<string, unknown>>;
      }>;
    };
  }
}
