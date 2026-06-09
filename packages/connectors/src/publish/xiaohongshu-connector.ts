import type {
  PublishConnector,
  PublishCapabilities,
  PublishConnectorConfig,
  PublishContentInput,
  PublishContentResult
} from './types.js';

export class XiaohongshuPublishConnector implements PublishConnector {
  readonly platform = 'xiaohongshu' as const;
  private config: PublishConnectorConfig;

  constructor(config: PublishConnectorConfig) {
    this.config = config;
  }

  async getCapabilities(): Promise<PublishCapabilities> {
    return {
      platform: 'xiaohongshu',
      publishContent: 'limited',
      checkStatus: false,
      deleteContent: false,
      uploadMedia: true,
      supportedContentTypes: ['text_image', 'video'],
      maxTitleLength: 20,
      maxContentLength: 1000,
      supportedModes: ['browser_assist', 'manual_import']
    };
  }

  async publishContent(
    _input: PublishContentInput
  ): Promise<PublishContentResult> {
    if (this.config.mode === 'browser_assist') {
      return {
        success: false,
        errorCode: 'BROWSER_ASSIST_REQUIRED',
        errorMessage: 'Use browser-runner for Xiaohongshu publishing'
      };
    }
    return {
      success: false,
      errorCode: 'MANUAL_REQUIRED',
      errorMessage: 'Xiaohongshu requires browser_assist or manual publishing'
    };
  }
}
