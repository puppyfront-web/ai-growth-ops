import type { PublishJobStatus, Platform, ContentType, ProviderMode } from './enums';
import type { ContentVariant } from './content';
import type { PlatformAccount } from './platform';

export type PublishAttempt = {
  id: string;
  publishJobId: string;
  attemptNo: number;
  status: string;
  error: string | null;
  screenshotId: string | null;
  startedAt: string;
  finishedAt: string | null;
  metadata: unknown;
};

export type PublishJob = {
  id: string;
  userId: string;
  contentVariantId: string;
  platformAccountId: string;
  platform: Platform;
  contentType: ContentType;
  mode: ProviderMode;
  status: PublishJobStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  externalPostId: string | null;
  externalUrl: string | null;
  lastError: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  metadata: unknown;
  /** Included by backend list/detail endpoints */
  contentVariant: ContentVariant;
  /** Included by backend list/detail endpoints */
  platformAccount: PlatformAccount;
  /** Included by backend list/detail endpoints */
  publishAttempts: PublishAttempt[];
};
