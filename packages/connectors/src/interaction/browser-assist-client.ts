import { platformPost } from './http-client.js';

const RUNNER_URL = process.env.BROWSER_RUNNER_URL || 'http://localhost:3200';

export interface BrowserAssistConfig {
  cookie: string;
  platform: string;
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
  ): Promise<any[]> {
    const url = `${this.runnerUrl}/assist/fetch-comments`;
    const result = await platformPost<any[]>(url, {
      platform: config.platform,
      cookie: config.cookie,
      sourceContentId,
      limit: limit || 50,
      cursor,
    });
    if (!result.success) return [];
    return result.data || [];
  }

  async fetchMessages(
    config: BrowserAssistConfig,
    limit?: number,
    cursor?: string,
  ): Promise<any[]> {
    const url = `${this.runnerUrl}/assist/fetch-messages`;
    const result = await platformPost<any[]>(url, {
      platform: config.platform,
      cookie: config.cookie,
      limit: limit || 50,
      cursor,
    });
    if (!result.success) return [];
    return result.data || [];
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
