import type {
  PublishConnector,
  PublishCapabilities,
  PublishConnectorConfig,
  PublishContentInput,
  PublishContentResult,
  CheckStatusInput,
  CheckStatusResult,
  UploadMediaInput,
  UploadMediaResult
} from './types.js';

export class DouyinPublishConnector implements PublishConnector {
  readonly platform = 'douyin' as const;
  private config: PublishConnectorConfig;

  constructor(config: PublishConnectorConfig) {
    this.config = config;
  }

  async getCapabilities(): Promise<PublishCapabilities> {
    return {
      platform: 'douyin',
      publishContent: true,
      checkStatus: true,
      deleteContent: true,
      uploadMedia: true,
      supportedContentTypes: ['text_image', 'video'],
      maxTitleLength: 55,
      supportedModes: ['official_api', 'browser_assist']
    };
  }

  async publishContent(
    input: PublishContentInput
  ): Promise<PublishContentResult> {
    if (!this.config.accessToken && !this.config.cookie) {
      return {
        success: false,
        errorCode: 'NO_CREDENTIALS',
        errorMessage: 'Douyin requires access_token or cookie'
      };
    }

    if (this.config.mode === 'browser_assist') {
      return {
        success: false,
        errorCode: 'BROWSER_ASSIST_REQUIRED',
        errorMessage: 'Use browser-runner for browser_assist mode'
      };
    }

    try {
      // Douyin Open API: POST https://open.douyin.com/api/douyin/v1/video/create_video/
      // or POST https://open.douyin.com/api/douyin/v1/photo/create_photo/ for image posts
      const isVideo = input.contentType === 'video';
      const endpoint = isVideo
        ? 'https://open.douyin.com/api/douyin/v1/video/create_video/'
        : 'https://open.douyin.com/api/douyin/v1/photo/create_photo/';

      const body: Record<string, unknown> = {
        text: input.title ? `${input.title}\n${input.content}` : input.content
      };

      if (input.tags && input.tags.length > 0) {
        body.text = `${body.text} ${input.tags.map((t) => `#${t}`).join(' ')}`;
      }

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.accessToken}`
        },
        body: JSON.stringify(body)
      });

      const data = (await resp.json()) as Record<string, unknown>;
      const dataNode = data.data as Record<string, unknown> | undefined;

      if (data.error_code === 0 || dataNode?.error_code === 0) {
        return {
          success: true,
          externalPostId: String(dataNode?.item_id || data.item_id || ''),
          status: 'published',
          rawResponse: data
        };
      }

      return {
        success: false,
        errorCode: String(data.error_code || dataNode?.error_code || 'UNKNOWN'),
        errorMessage: String(
          data.description ||
            dataNode?.description ||
            'Unknown Douyin API error'
        ),
        rawResponse: data
      };
    } catch (err) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage:
          err instanceof Error
            ? err.message
            : 'Network error calling Douyin API'
      };
    }
  }

  async checkStatus(input: CheckStatusInput): Promise<CheckStatusResult> {
    try {
      const resp = await fetch(
        `https://open.douyin.com/api/douyin/v1/video/search_video/?item_id=${input.externalPostId}`,
        {
          headers: { Authorization: `Bearer ${this.config.accessToken}` }
        }
      );
      const data = (await resp.json()) as Record<string, unknown>;
      const list = (data.data as Record<string, unknown>)?.list as
        | Array<Record<string, unknown>>
        | undefined;
      const item = list?.[0];

      if (!item) {
        return { status: 'failed', rawData: data };
      }

      const statusMap: Record<
        number,
        'published' | 'pending_review' | 'failed' | 'rejected'
      > = {
        1: 'pending_review',
        2: 'published',
        3: 'failed',
        4: 'rejected'
      };

      return {
        status: statusMap[item.status as number] || 'published',
        externalUrl: item.share_url as string | undefined,
        likeCount: item.digg_count as number | undefined,
        commentCount: item.comment_count as number | undefined,
        shareCount: item.share_count as number | undefined,
        viewCount: item.play_count as number | undefined,
        rawData: item
      };
    } catch {
      return { status: 'failed' };
    }
  }

  async uploadMedia(_input: UploadMediaInput): Promise<UploadMediaResult> {
    return {
      success: false,
      errorMessage:
        'Media upload via API requires init + chunk upload flow; use browser_assist'
    };
  }
}
