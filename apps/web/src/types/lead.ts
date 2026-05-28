import type { LeadLevel, LeadStatus, Platform } from './enums';
import type { Interaction } from './interaction';

export type LeadActivity = {
  id: string;
  leadId: string;
  action: string;
  note: string | null;
  operator: string | null;
  createdAt: string;
  metadata: unknown;
};

export type LeadExternalMapping = {
  id: string;
  leadId: string;
  sinkType: string;
  externalId: string;
  externalUrl: string | null;
  syncedAt: string;
  metadata: unknown;
};

export type LeadSinkSyncLog = {
  id: string;
  leadId: string;
  sinkType: string;
  operation: string;
  status: string;
  error: string | null;
  attemptedAt: string;
  metadata: unknown;
};

export type Lead = {
  id: string;
  userId: string;
  sourcePlatform: Platform;
  sourceAccountId: string;
  sourceInteractionId: string | null;
  sourcePublishJobId: string | null;
  externalUserId: string;
  externalUserName: string | null;
  level: LeadLevel;
  status: LeadStatus;
  intent: string | null;
  confidence: number | null;
  summary: string | null;
  tags: unknown;
  assignedTo: string | null;
  nextAction: string | null;
  riskLevel: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  metadata: unknown;
  /** Included by backend list/detail endpoints */
  leadActivities: LeadActivity[];
  /** Included by backend list/detail endpoints */
  interaction: Interaction | null;
  /** Included by backend list/detail endpoints */
  externalMappings: LeadExternalMapping[];
  /** Included by backend list/detail endpoints */
  syncLogs: LeadSinkSyncLog[];
};

export type LeadSyncStatus = {
  feishu: 'none' | 'syncing' | 'synced' | 'failed';
  wecom: 'none' | 'syncing' | 'synced' | 'failed';
};
