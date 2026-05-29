import { platformPost } from './http-client.js';

const RUNNER_URL = process.env.BROWSER_RUNNER_URL || 'http://localhost:3200';

export interface BrowserAssistConfig {
  cookie: string;
  platform: string;
}

function requireArrayResponse(
  result: { success: boolean; data: unknown; errorMessage?: string },
  fetchType: 'comments' | 'messages',
): any[] {
  if (!result.success) {
    throw new Error(result.errorMessage || `browser-assist ${fetchType} request failed`);
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
    headed?: boolean,
  ): Promise<any[]> {
    const url = `${this.runnerUrl}/assist/fetch-comments`;
    const result = await platformPost<any[]>(url, {
      platform: config.platform,
      cookie: config.cookie,
      sourceContentId,
      limit: limit || 50,
      cursor,
      headed,
    });
    return requireArrayResponse(result, 'comments');
  }

  async fetchMessages(
    config: BrowserAssistConfig,
    limit?: number,
    cursor?: string,
    headed?: boolean,
  ): Promise<any[]> {
    const url = `${this.runnerUrl}/assist/fetch-messages`;
    const result = await platformPost<any[]>(url, {
      platform: config.platform,
      cookie: config.cookie,
      limit: limit || 50,
      cursor,
      headed,
    });
    return requireArrayResponse(result, 'messages');
  }

  async replyComment(
    config: BrowserAssistConfig,
    externalCommentId: string,
    replyText: string,
    sourceContentId?: string,
  ): Promise<{ success: boolean; externalReplyId?: string }> {
    const url = `${this.runnerUrl}/assist/reply-comment`;
    const result = await platformPost<{ success: boolean; externalReplyId?: string }>(url, {
      platform: config.platform,
      cookie: config.cookie,
      externalCommentId,
      replyText,
      sourceContentId,
    });
    return result.data || { success: false };
  }

  async replyMessage(
    config: BrowserAssistConfig,
    externalUserId: string,
    messageText: string,
  ): Promise<{ success: boolean; externalReplyId?: string }> {
    const url = `${this.runnerUrl}/assist/reply-message`;
    const result = await platformPost<{ success: boolean; externalReplyId?: string }>(url, {
      platform: config.platform,
      cookie: config.cookie,
      externalUserId,
      messageText,
    });
    return result.data || { success: false };
  }
}
