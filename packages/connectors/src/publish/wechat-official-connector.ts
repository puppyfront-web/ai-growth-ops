import type {
  PublishConnector,
  PublishCapabilities,
  PublishConnectorConfig,
  PublishContentInput,
  PublishContentResult,
  UploadMediaInput,
  UploadMediaResult,
} from './types.js';

export class WechatOfficialPublishConnector implements PublishConnector {
  readonly platform = 'wechat_official' as const;
  private config: PublishConnectorConfig;

  constructor(config: PublishConnectorConfig) {
    this.config = config;
  }

  async getCapabilities(): Promise<PublishCapabilities> {
    return {
      platform: 'wechat_official',
      publishContent: true,
      checkStatus: true,
      deleteContent: true,
      uploadMedia: true,
      supportedContentTypes: ['article'],
      supportedModes: ['official_api'],
    };
  }

  async publishContent(input: PublishContentInput): Promise<PublishContentResult> {
    if (!this.config.appId || !this.config.appSecret) {
      return { success: false, errorCode: 'NO_CREDENTIALS', errorMessage: 'WeChat Official requires appId and appSecret' };
    }

    try {
      const accessToken = await this.getAccessToken();
      // Draft first, then publish
      const draftResp = await fetch(
        `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            articles: [{
              title: input.title || 'Untitled',
              content: input.content,
              digest: input.content.slice(0, 120),
            }],
          }),
        },
      );

      const draftData = await draftResp.json() as Record<string, unknown>;

      if (draftData.errcode && draftData.errcode !== 0) {
        return {
          success: false,
          errorCode: String(draftData.errcode),
          errorMessage: String(draftData.errmsg || 'WeChat API error'),
          rawResponse: draftData,
        };
      }

      const mediaId = draftData.media_id as string;

      // Submit for publish
      const pubResp = await fetch(
        `https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=${accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ media_id: mediaId }),
        },
      );

      const pubData = await pubResp.json() as Record<string, unknown>;

      if (pubData.errcode && pubData.errcode !== 0) {
        return {
          success: true,
          externalPostId: mediaId,
          status: 'pending_review',
          rawResponse: { draft: draftData, publish: pubData },
        };
      }

      return {
        success: true,
        externalPostId: mediaId,
        status: 'pending_review',
        rawResponse: { draft: draftData, publish: pubData },
      };
    } catch (err) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  async uploadMedia(input: UploadMediaInput): Promise<UploadMediaResult> {
    try {
      const accessToken = await this.getAccessToken();
      const resp = await fetch(
        `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${accessToken}&type=${input.fileType === 'video' ? 'video' : 'image'}`,
        { method: 'POST', body: JSON.stringify({ url: input.fileUrl }) },
      );
      const data = await resp.json() as Record<string, unknown>;
      if (data.errcode && data.errcode !== 0) {
        return { success: false, errorMessage: String(data.errmsg) };
      }
      return { success: true, mediaId: data.media_id as string, mediaUrl: data.url as string };
    } catch (err) {
      return { success: false, errorMessage: err instanceof Error ? err.message : 'Upload failed' };
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.config.accessToken) return this.config.accessToken;
    const resp = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.config.appId}&secret=${this.config.appSecret}`,
    );
    const data = await resp.json() as Record<string, unknown>;
    return data.access_token as string;
  }
}
