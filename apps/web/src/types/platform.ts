import type { Platform, AccountStatus, ProviderMode } from './enums';

export type PlatformCapabilityKey =
  | 'text_image_publish'
  | 'video_publish'
  | 'comment_sync'
  | 'comment_reply'
  | 'message_sync'
  | 'auto_reply'
  | 'data_analysis';

export type PlatformCapability = {
  id: string;
  userId: string;
  platformAccountId: string;
  platform: Platform;
  capabilityKey: string;
  mode: ProviderMode;
  enabled: boolean;
  limits: unknown;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  metadata: unknown;
};

export type PlatformAccount = {
  id: string;
  userId: string;
  platform: Platform;
  name: string;
  mode: ProviderMode;
  status: AccountStatus;
  authType: string | null;
  capabilities: Record<PlatformCapabilityKey, boolean> | null;
  lastHealthCheckAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  metadata: unknown;
  /** Included by backend accounts endpoint */
  platformCapabilities: PlatformCapability[];
};
