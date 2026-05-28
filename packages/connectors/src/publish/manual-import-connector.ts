import type {
  PublishConnector,
  PublishCapabilities,
  PublishConnectorConfig,
  PublishContentInput,
  PublishContentResult,
} from './types.js';

export class ManualImportPublishConnector implements PublishConnector {
  readonly platform;

  constructor(platform: any, private config?: PublishConnectorConfig) {
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
      supportedModes: ['manual_import'],
    };
  }

  async publishContent(_input: PublishContentInput): Promise<PublishContentResult> {
    return {
      success: false,
      errorCode: 'MANUAL_REQUIRED',
      errorMessage: `Platform ${this.platform} requires manual publishing. Use manual-confirm flow.`,
    };
  }
}
