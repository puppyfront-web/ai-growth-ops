import type { MediaSourceType, MediaReviewStatus } from './enums';

export type MediaAsset = {
  id: string;
  userId: string;
  fileName: string;
  fileType: string;
  fileSize: number | null;
  sourceType: MediaSourceType;
  sourceUrl: string | null;
  reviewStatus: MediaReviewStatus;
  generationProvider: string | null;
  generationPromptHash: string | null;
  costEstimate: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  metadata: unknown;
};
