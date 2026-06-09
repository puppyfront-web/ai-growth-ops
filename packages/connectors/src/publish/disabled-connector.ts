import type {
  PublishConnector,
  PublishCapabilities,
  PublishConnectorConfig,
  PublishContentInput,
  PublishContentResult
} from './types.js';

export class DisabledPublishConnector implements PublishConnector {
  readonly platform;

  constructor(
    platform: string,
    private config: PublishConnectorConfig
  ) {
    this.platform = platform;
  }

  async getCapabilities(): Promise<PublishCapabilities> {
    return {
      platform: this.platform,
      publishContent: false,
      checkStatus: false,
      deleteContent: false,
      uploadMedia: false,
      supportedContentTypes: [],
      supportedModes: ['disabled']
    };
  }

  async publishContent(
    _input: PublishContentInput
  ): Promise<PublishContentResult> {
    return {
      success: false,
      errorCode: 'PLATFORM_DISABLED',
      errorMessage: `Publishing is disabled for platform: ${this.platform}`
    };
  }
}
