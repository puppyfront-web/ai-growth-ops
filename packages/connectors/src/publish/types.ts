import type { PlatformCode, InteractionMode } from '../interaction/types.js';

export type { PlatformCode, InteractionMode };

export interface PublishCapabilities {
  platform: PlatformCode;
  publishContent: boolean | 'limited';
  checkStatus: boolean;
  deleteContent: boolean;
  uploadMedia: boolean;
  supportedContentTypes: string[];
  maxTitleLength?: number;
  maxContentLength?: number;
  supportedModes: InteractionMode[];
}

export interface PublishContentInput {
  platformAccountId: string;
  contentType: 'text_image' | 'video' | 'article' | 'answer';
  title?: string;
  content: string;
  mediaAssetIds?: string[];
  mediaUrls?: string[];
  tags?: string[];
  scheduledAt?: string;
  metadata?: Record<string, unknown>;
}

export interface PublishContentResult {
  success: boolean;
  externalPostId?: string;
  externalUrl?: string;
  status?: 'published' | 'pending_review' | 'scheduled' | 'draft';
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: Record<string, unknown>;
}

export interface CheckStatusInput {
  platformAccountId: string;
  externalPostId: string;
}

export interface CheckStatusResult {
  status: 'published' | 'pending_review' | 'failed' | 'deleted' | 'rejected';
  externalUrl?: string;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  viewCount?: number;
  rawData?: Record<string, unknown>;
}

export interface DeleteContentInput {
  platformAccountId: string;
  externalPostId: string;
}

export interface DeleteContentResult {
  success: boolean;
  errorMessage?: string;
}

export interface UploadMediaInput {
  platformAccountId: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
}

export interface UploadMediaResult {
  success: boolean;
  mediaId?: string;
  mediaUrl?: string;
  errorMessage?: string;
}

export interface PublishConnector {
  readonly platform: PlatformCode;
  getCapabilities(): Promise<PublishCapabilities>;
  publishContent(input: PublishContentInput): Promise<PublishContentResult>;
  checkStatus?(input: CheckStatusInput): Promise<CheckStatusResult>;
  deleteContent?(input: DeleteContentInput): Promise<DeleteContentResult>;
  uploadMedia?(input: UploadMediaInput): Promise<UploadMediaResult>;
}

export interface PublishConnectorConfig {
  mode: InteractionMode;
  accessToken?: string;
  refreshToken?: string;
  cookie?: string;
  appId?: string;
  appSecret?: string;
  openId?: string;
  customConfig?: Record<string, unknown>;
}
