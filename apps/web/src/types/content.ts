import type {
  ContentType,
  ContentStatus,
  Platform,
  ComplianceStatus
} from './enums';

export type ContentVariant = {
  id: string;
  userId: string;
  contentItemId: string;
  platform: Platform;
  contentType: ContentType;
  title: string | null;
  body: string | null;
  tags: string[];
  cta: string | null;
  mediaAssetIds: string[];
  complianceStatus: ComplianceStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  metadata: unknown;
};

export type ContentItem = {
  id: string;
  userId: string;
  projectId: string;
  type: ContentType;
  title: string;
  body: string | null;
  status: ContentStatus;
  sourceType: string | null;
  sourceResearchTaskId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  metadata: unknown;
  mediaAssetIds?: string[];
  /** Included by backend list/detail endpoints */
  contentVariants: ContentVariant[];
};

export type ContentProject = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  metadata: unknown;
};
