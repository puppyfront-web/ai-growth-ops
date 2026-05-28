import type {
  PublishConnector,
  PublishCapabilities,
  PublishConnectorConfig,
  PublishContentInput,
  PublishContentResult,
} from './types.js';

export class ZhihuPublishConnector implements PublishConnector {
  readonly platform = 'zhihu' as const;
  private config: PublishConnectorConfig;

  constructor(config: PublishConnectorConfig) {
    this.config = config;
  }

  async getCapabilities(): Promise<PublishCapabilities> {
    return {
      platform: 'zhihu',
      publishContent: 'limited',
      checkStatus: false,
      deleteContent: false,
      uploadMedia: false,
      supportedContentTypes: ['article', 'answer'],
      maxTitleLength: 100,
      maxContentLength: 50000,
      supportedModes: ['browser_assist', 'manual_import'],
    };
  }

  async publishContent(_input: PublishContentInput): Promise<PublishContentResult> {
    if (this.config.mode === 'browser_assist') {
      return { success: false, errorCode: 'BROWSER_ASSIST_REQUIRED', errorMessage: 'Use browser-runner for Zhihu publishing' };
    }
    return {
      success: false,
      errorCode: 'MANUAL_REQUIRED',
      errorMessage: 'Zhihu requires browser_assist or manual publishing',
    };
  }
}
