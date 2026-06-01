import type { Platform, PublishJobStatus, InteractionStatus, LeadLevel, ResearchStatus, MediaReviewStatus, RiskLevel } from '@/types/enums';

export const platformLabels: Record<Platform, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat_official: '微信公众号',
  wechat_channels: '微信视频号',
  baijiahao: '百家号',
  zhihu: '知乎',
};

export const platformIcons: Record<Platform, string> = {
  douyin: '🎵',
  xiaohongshu: '📕',
  wechat_official: '💬',
  wechat_channels: '📹',
  baijiahao: '📰',
  zhihu: '💡',
};

export const publishStatusLabels: Record<PublishJobStatus, string> = {
  DRAFT: '待发布',
  READY: '就绪',
  SCHEDULED: '已排期',
  RUNNING: '发布中',
  WAITING_HUMAN_CONFIRM: '等待人工确认',
  PUBLISHED: '已发布',
  FAILED: '失败',
  NEED_MANUAL_REPAIR: '需人工修复',
  CANCELLED: '已取消',
};

export const interactionStatusLabels: Record<InteractionStatus, string> = {
  NEW: '新消息',
  NORMALIZED: '已标准化',
  CLASSIFYING: '分类中',
  CLASSIFIED: '已分类',
  REPLY_SUGGESTED: '已建议回复',
  WAITING_HUMAN_REVIEW: '等待人工审核',
  REPLIED: '已回复',
  CONVERTED_TO_LEAD: '已转线索',
  IGNORED: '已忽略',
};

export const leadLevelLabels: Record<LeadLevel, string> = {
  A: 'A级-高意向',
  B: 'B级-中意向',
  C: 'C级-低意向',
  D: 'D级-无意向',
};

export const researchStatusLabels: Record<ResearchStatus, string> = {
  DRAFT: '草稿',
  QUEUED: '排队中',
  RUNNING: '运行中',
  ANALYZING: '分析中',
  INSIGHT_GENERATED: '洞察已生成',
  FAILED: '失败',
  PAUSED: '已暂停',
};

export const mediaReviewStatusLabels: Record<MediaReviewStatus, string> = {
  pending_review: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
};

export const riskLevelLabels: Record<RiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

export const contentTypeLabels: Record<string, string> = {
  text_image: '图文',
  video: '视频',
  article: '文章',
  answer: '问答',
};

export const publishModeLabels: Record<string, string> = {
  official_api: '官方API',
  browser_assist: '浏览器辅助',
  manual_confirm: '人工确认',
  manual_import: '手动导入',
};

export const leadStatusLabels: Record<string, string> = {
  NEW: '新线索',
  QUALIFIED: '已验证',
  SYNCING: '同步中',
  SYNCED: '已同步飞书',
  ASSIGNED: '已分配',
  CONTACTED: '已联系',
  ADDED_WECOM: '已加企微',
  WON: '已成交',
  LOST: '已流失',
  INVALID: '无效',
};

export const leadPipelineFlow = ['NEW', 'QUALIFIED', 'SYNCED', 'ASSIGNED', 'CONTACTED', 'ADDED_WECOM', 'WON'] as const;

export const contentStatusLabels: Record<string, string> = {
  draft: '草稿',
  ready: '就绪',
  archived: '已归档',
};

export const calendarItemColors: Record<string, string> = {
  content: 'bg-teal-400',
  PUBLISHED: 'bg-emerald-500',
  SCHEDULED: 'bg-amber-400',
  RUNNING: 'bg-blue-500',
  FAILED: 'bg-red-500',
  NEED_MANUAL_REPAIR: 'bg-orange-500',
  WAITING_HUMAN_CONFIRM: 'bg-purple-400',
  DRAFT: 'bg-gray-400',
  READY: 'bg-gray-300',
  CANCELLED: 'bg-gray-300',
};

export const platformColorMap: Record<string, string> = {
  douyin: '#FE2C55',
  xiaohongshu: '#FF2442',
  wechat_official: '#07C160',
  wechat_channels: '#07C160',
  baijiahao: '#2932E1',
  zhihu: '#0066FF',
};

export const statusVariantMap: Record<string, 'success' | 'warning' | 'danger' | 'muted' | 'info'> = {
  success: 'success',
  published: 'success',
  approved: 'success',
  active: 'success',
  synced: 'success',
  won: 'success',
  warning: 'warning',
  pending: 'warning',
  running: 'warning',
  scheduled: 'warning',
  processing: 'warning',
  medium: 'warning',
  danger: 'danger',
  failed: 'danger',
  error: 'danger',
  expired: 'danger',
  rejected: 'danger',
  high: 'danger',
  cancelled: 'danger',
  muted: 'muted',
  draft: 'muted',
  disabled: 'muted',
  DRAFT: 'muted',
  CANCELLED: 'muted',
  invalid: 'muted',
  ignored: 'muted',
  info: 'info',
  low: 'info',
};
