import type {
  PublishConnector,
  PublishCapabilities,
  PublishConnectorConfig,
  PublishContentInput,
  PublishContentResult,
  CheckStatusInput,
  CheckStatusResult,
  DeleteContentInput,
  DeleteContentResult,
  UploadMediaInput,
  UploadMediaResult,
  PlatformCode
} from './types.js';
import { randomUUID } from 'crypto';

export class SandboxPublishConnector implements PublishConnector {
  readonly platform: PlatformCode;
  private config: PublishConnectorConfig;

  constructor(platform: PlatformCode, config: PublishConnectorConfig) {
    this.platform = platform;
    this.config = config;
  }

  async getCapabilities(): Promise<PublishCapabilities> {
    return {
      platform: this.platform,
      publishContent: true,
      checkStatus: true,
      deleteContent: true,
      uploadMedia: true,
      supportedContentTypes: ['text_image', 'video', 'article', 'answer'],
      maxTitleLength: 100,
      maxContentLength: 10000,
      supportedModes: ['sandbox', 'recorded']
    };
  }

  async publishContent(
    input: PublishContentInput
  ): Promise<PublishContentResult> {
    const id = `sandbox_post_${randomUUID().slice(0, 8)}`;
    return {
      success: true,
      externalPostId: id,
      externalUrl: `https://sandbox.example.com/post/${id}`,
      status: 'published',
      rawResponse: { id, contentType: input.contentType, title: input.title }
    };
  }

  async checkStatus(input: CheckStatusInput): Promise<CheckStatusResult> {
    return {
      status: 'published',
      externalUrl: `https://sandbox.example.com/post/${input.externalPostId}`,
      likeCount: Math.floor(Math.random() * 1000),
      commentCount: Math.floor(Math.random() * 100),
      shareCount: Math.floor(Math.random() * 50),
      viewCount: Math.floor(Math.random() * 10000)
    };
  }

  async deleteContent(
    _input: DeleteContentInput
  ): Promise<DeleteContentResult> {
    return { success: true };
  }

  async uploadMedia(_input: UploadMediaInput): Promise<UploadMediaResult> {
    const id = `sandbox_media_${randomUUID().slice(0, 8)}`;
    return {
      success: true,
      mediaId: id,
      mediaUrl: `https://sandbox.example.com/media/${id}`
    };
  }
}
