import { apiDownload, apiGet, apiPost } from './client';

/** Platforms the crawler actually supports; keep in sync with the API schema. */
export const PROSPECTING_SUPPORTED_PLATFORMS = ['douyin'] as const;

export type ProspectingTaskStatus =
  'draft' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ProspectingPlatform =
  | 'douyin'
  | 'xiaohongshu'
  | 'wechat_official'
  | 'wechat_channels'
  | 'baijiahao'
  | 'zhihu';

export type ProspectEvidence = {
  content: string;
  sourceVideoTitle: string | null;
  sourceVideoUrl: string | null;
  publishedAt: string | null;
  likeCount: number | null;
};

export type ProspectUserProfile = {
  nickname: string | null;
  signature: string | null;
  followerCount: number | null;
  followingCount: number | null;
  likeCount: number | null;
  location: string | null;
  homepage: string;
  fetchedAt: string;
};

export type ProspectCandidate = {
  id: string;
  prospectingTaskId: string;
  organizationId: string;
  platform: ProspectingPlatform;
  keyword: string;
  userKey: string;
  externalUserId: string | null;
  userNickname: string | null;
  userHomepage: string | null;
  avatarUrl: string | null;
  content: string;
  commentCount: number;
  evidence: ProspectEvidence[] | null;
  sourceVideoTitle: string | null;
  sourceVideoUrl: string | null;
  sourceVideoAuthor: string | null;
  sourcePostId: string | null;
  relevanceScore: number;
  leadLevel: string;
  scoreSource: 'rules' | 'skill';
  intent: string | null;
  summary: string | null;
  matchedKeywords: string[] | null;
  customerId: string | null;
  metadata?: {
    profile?: ProspectUserProfile;
    convertedAt?: string;
    enrichStatus?: 'queued' | 'running' | 'failed' | null;
    enrichError?: string | null;
  } | null;
  createdAt: string;
};

export type ProspectingTaskProgress = {
  phase?:
    | 'starting'
    | 'searching'
    | 'crawling'
    | 'scoring'
    | 'saving'
    | 'done'
    | 'captcha'
    | 'failed';
  currentKeyword?: string;
  keywordIndex?: number;
  keywordTotal?: number;
  videoIndex?: number;
  videoTotal?: number;
  currentVideoTitle?: string;
  scoringBatchIndex?: number;
  scoringBatchTotal?: number;
  updatedAt?: string;
  warning?: string;
  captchaRequired?: boolean;
};

export type ProspectingTask = {
  id: string;
  organizationId: string;
  userId: string;
  platform: ProspectingPlatform;
  keywords: string[];
  status: ProspectingTaskStatus;
  topNVideos: number;
  maxCommentsPerVideo: number;
  commentScrollRounds: number;
  minRelevanceScore: number;
  totalVideos: number;
  totalComments: number;
  totalCandidates: number;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  metadata?: ProspectingTaskProgress | null;
  createdAt: string;
  updatedAt: string;
  candidates?: ProspectCandidate[];
};

export function getProspectingProgressPercent(task: ProspectingTask): number {
  const meta = task.metadata;
  if (task.status === 'completed') return 100;
  if (task.status !== 'running' || !meta?.phase) return 0;

  const keywordTotal = meta.keywordTotal ?? 1;
  const keywordIndex = Math.max(0, (meta.keywordIndex ?? 1) - 1);
  const videoTotal = meta.videoTotal ?? 0;
  const videoIndex = meta.videoIndex ?? 0;
  const keywordSlice = 75 / keywordTotal;
  const keywordBase = keywordIndex * keywordSlice;

  switch (meta.phase) {
    case 'starting':
      return 3;
    case 'searching':
      return Math.min(74, keywordBase + keywordSlice * 0.15);
    case 'crawling': {
      const videoPart =
        videoTotal > 0 ? (videoIndex / videoTotal) * keywordSlice * 0.85 : 0;
      return Math.min(74, keywordBase + keywordSlice * 0.15 + videoPart);
    }
    case 'scoring': {
      const batchTotal = meta.scoringBatchTotal ?? 0;
      const batchIndex = meta.scoringBatchIndex ?? 0;
      const batchPart =
        batchTotal > 0 && batchIndex > 0
          ? ((batchIndex - 1) / batchTotal) * 12
          : 0;
      return Math.min(94, 82 + batchPart);
    }
    case 'saving':
      return 95;
    default:
      return 10;
  }
}

export function formatProspectingProgress(task: ProspectingTask): string {
  const meta = task.metadata;
  if (task.status === 'running' && meta?.phase) {
    const keywordPart =
      meta.keywordTotal && meta.keywordIndex
        ? `关键词 ${meta.keywordIndex}/${meta.keywordTotal}`
        : '';
    const current = meta.currentKeyword ? `「${meta.currentKeyword}」` : '';
    const videoPart =
      meta.videoTotal && meta.videoIndex !== undefined
        ? ` · 视频 ${meta.videoIndex}/${meta.videoTotal}`
        : meta.videoTotal
          ? ` · 共 ${meta.videoTotal} 个视频`
          : '';

    switch (meta.phase) {
      case 'starting':
        return '准备中…';
      case 'searching':
        return `搜索视频中 ${keywordPart} ${current}`.trim();
      case 'crawling': {
        const title = meta.currentVideoTitle
          ? `：${meta.currentVideoTitle.slice(0, 24)}`
          : '';
        return `爬取评论中 ${keywordPart}${videoPart}${title}`.trim();
      }
      case 'scoring': {
        const batchPart =
          meta.scoringBatchTotal && meta.scoringBatchIndex
            ? ` · 批次 ${meta.scoringBatchIndex}/${meta.scoringBatchTotal}`
            : '';
        return `分析潜客 ${keywordPart}${batchPart}`.trim();
      }
      case 'saving':
        return '保存结果…';
      default:
        return '执行中…';
    }
  }
  if (task.status === 'running') {
    if (task.totalVideos > 0 || task.totalComments > 0) {
      return `已爬 ${task.totalVideos} 视频 · ${task.totalComments} 评论`;
    }
    return '执行中…';
  }
  if (task.status === 'completed' && meta?.warning) return meta.warning;
  return '';
}

export type CreateProspectingTaskInput = {
  platform: ProspectingPlatform;
  keywords: string[];
  topNVideos?: number;
  maxCommentsPerVideo?: number;
  commentScrollRounds?: number;
  minRelevanceScore?: number;
};

export type ProspectingGuard = {
  date: string;
  videosCrawled: number;
  profilesFetched: number;
  captchaBlockedUntil: string | null;
  videosRemaining: number;
  profilesRemaining: number;
  captchaWaitMs: number;
  needsLogin: boolean;
  platformAccountId: string | null;
  platformAccountName: string | null;
  estimatedMinutesRemaining: number;
  skipTtlDays: number;
  captchaHits?: number;
  health?: {
    status: 'needs_login' | 'cooling' | 'quota_exhausted' | 'healthy';
    score: number;
    label: string;
    captchaHitsToday: number;
  };
  limits: {
    dailyVideoLimit: number;
    dailyProfileLimit: number;
    maxVideosPerTask: number;
    maxKeywordsPerTask: number;
    minVideoGapMs: number;
    maxVideoGapMs: number;
    videoSkipTtlDays: number;
  };
};

export function estimateProspectingMinutes(
  videoCount: number,
  limits?: Pick<ProspectingGuard['limits'], 'minVideoGapMs' | 'maxVideoGapMs'>
): number {
  if (videoCount <= 0) return 0;
  const min = limits?.minVideoGapMs ?? 8_000;
  const max = limits?.maxVideoGapMs ?? 18_000;
  const perVideoSec = (min + max) / 2000 + 12;
  return Math.max(1, Math.ceil((videoCount * perVideoSec) / 60));
}

export function getProspectingGuard(platform = 'douyin') {
  return apiGet<ProspectingGuard>(
    `/api/prospecting/guard?platform=${encodeURIComponent(platform)}`
  );
}

export function listProspectingTasks(page = 1, pageSize = 20) {
  return apiGet<{
    items: ProspectingTask[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>(`/api/prospecting/tasks?page=${page}&pageSize=${pageSize}`);
}

export function getProspectingTask(id: string, minScore?: number) {
  const qs = minScore ? `?minScore=${minScore}` : '';
  return apiGet<ProspectingTask>(`/api/prospecting/tasks/${id}${qs}`);
}

export function createProspectingTask(data: CreateProspectingTaskInput) {
  return apiPost<ProspectingTask>('/api/prospecting/tasks', data);
}

export function runProspectingTask(id: string, forceRecrawl = false) {
  return apiPost<{ queued: boolean; taskId: string }>(
    `/api/prospecting/tasks/${id}/run`,
    { forceRecrawl }
  );
}

export function exportProspectingTask(id: string, minScore?: number) {
  const qs = minScore ? `?minScore=${minScore}` : '';
  return apiDownload(
    `/api/prospecting/tasks/${id}/export.csv${qs}`,
    `prospects-${id}.csv`
  );
}

export function convertProspectToCustomer(
  candidateId: string,
  data: {
    phone?: string;
    displayName?: string;
    company?: string;
    role?: string;
    intent?: string;
    confirmDuplicate?: boolean;
  }
) {
  return apiPost<{
    customer: { id: string };
    candidate: ProspectCandidate;
    reused: boolean;
  }>(`/api/prospecting/candidates/${candidateId}/convert`, data);
}

export function enrichProspectProfile(candidateId: string) {
  return apiPost<{ queued: boolean; candidateId: string }>(
    `/api/prospecting/candidates/${candidateId}/enrich`,
    {}
  );
}

export function startProspectingCaptcha() {
  return apiPost<{ sessionId: string; status: string }>(
    '/api/prospecting/captcha/start',
    {}
  );
}

export function getProspectingCaptchaStatus() {
  return apiGet<{
    status: 'waiting' | 'solved' | 'expired';
    error?: string;
  }>('/api/prospecting/captcha/status');
}

export function cancelProspectingCaptcha() {
  return apiPost<{ ok: boolean }>('/api/prospecting/captcha/cancel', {});
}

export function resolveProspectingCaptcha() {
  return apiPost<{ ok: boolean }>('/api/prospecting/captcha/resolved', {});
}
