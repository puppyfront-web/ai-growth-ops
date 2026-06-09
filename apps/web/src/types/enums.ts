export type Platform =
  | 'douyin'
  | 'xiaohongshu'
  | 'wechat_official'
  | 'wechat_channels'
  | 'baijiahao'
  | 'zhihu';
export type ProviderMode =
  | 'official_api'
  | 'browser_assist'
  | 'manual_confirm'
  | 'manual_import';
export type AccountStatus = 'active' | 'expired' | 'disabled' | 'error';
export type ContentType = 'text_image' | 'video' | 'article' | 'answer';
export type ContentStatus = 'draft' | 'ready' | 'archived';
export type ComplianceStatus = 'pending' | 'approved' | 'rejected';
export type PublishJobStatus =
  | 'DRAFT'
  | 'READY'
  | 'SCHEDULED'
  | 'RUNNING'
  | 'WAITING_HUMAN_CONFIRM'
  | 'PUBLISHED'
  | 'FAILED'
  | 'NEED_MANUAL_REPAIR'
  | 'CANCELLED';
export type InteractionType =
  | 'comment'
  | 'message'
  | 'official_message'
  | 'form_submission';
export type InteractionStatus =
  | 'NEW'
  | 'NORMALIZED'
  | 'CLASSIFYING'
  | 'CLASSIFIED'
  | 'REPLY_SUGGESTED'
  | 'WAITING_HUMAN_REVIEW'
  | 'REPLIED'
  | 'CONVERTED_TO_LEAD'
  | 'IGNORED';
export type LeadLevel = 'A' | 'B' | 'C' | 'D';
export type LeadStatus =
  | 'NEW'
  | 'QUALIFIED'
  | 'SYNCING'
  | 'SYNCED'
  | 'ASSIGNED'
  | 'CONTACTED'
  | 'ADDED_WECOM'
  | 'WON'
  | 'LOST'
  | 'INVALID';
export type ResearchStatus =
  | 'DRAFT'
  | 'QUEUED'
  | 'RUNNING'
  | 'ANALYZING'
  | 'INSIGHT_GENERATED'
  | 'FAILED'
  | 'PAUSED';
export type MediaSourceType = 'uploaded' | 'external_url' | 'generated_future';
export type MediaReviewStatus = 'pending_review' | 'approved' | 'rejected';
export type RiskLevel = 'low' | 'medium' | 'high';
export type PublishMode =
  | 'official_api'
  | 'browser_assist'
  | 'manual_confirm'
  | 'manual_import';
