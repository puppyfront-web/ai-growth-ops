import type {
  PublishConnector,
  PublishCapabilities,
  PublishConnectorConfig,
  PublishContentInput,
  PublishContentResult
} from './types.js';

export class WechatChannelsPublishConnector implements PublishConnector {
  readonly platform = 'wechat_channels' as const;
  private config: PublishConnectorConfig;

  constructor(config: PublishConnectorConfig) {
    this.config = config;
  }

  async getCapabilities(): Promise<PublishCapabilities> {
    return {
      platform: 'wechat_channels',
      publishContent: 'limited',
      checkStatus: false,
      deleteContent: false,
      uploadMedia: true,
      supportedContentTypes: ['text_image', 'video'],
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
        errorMessage: 'Use browser-runner for WeChat Channels publishing'
      };
    }
    return {
      success: false,
      errorCode: 'MANUAL_REQUIRED',
      errorMessage:
        'WeChat Channels requires browser_assist or manual publishing'
    };
  }
}
