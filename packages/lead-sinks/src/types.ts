export interface LeadData {
  id: string;
  sourcePlatform: string;
  externalUserName?: string;
  level: string;
  intent?: string;
  summary?: string;
  confidence?: number;
  tags?: unknown;
  assignedTo?: string;
  nextAction?: string;
  riskLevel?: string;
  createdAt: Date;
  [key: string]: unknown;
}

export interface SinkResult {
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface LeadSinkConfig {
  appId?: string;
  appSecret?: string;
  appToken?: string;
  tableId?: string;
  corpId?: string;
  agentId?: string;
  secret?: string;
  webhookUrl?: string;
  fieldMapping?: Record<string, string>;
  [key: string]: unknown;
}

export interface LeadSink {
  readonly sinkType: string;
  sync(lead: LeadData, config: LeadSinkConfig): Promise<SinkResult>;
  testConnection(
    config: LeadSinkConfig
  ): Promise<{ success: boolean; message: string }>;
}

export interface NotifySink {
  readonly sinkType: string;
  notify(
    lead: LeadData,
    config: LeadSinkConfig,
    message?: string
  ): Promise<SinkResult>;
}
