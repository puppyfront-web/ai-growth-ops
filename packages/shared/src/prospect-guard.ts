/**
 * Prospecting must grow coverage over days, not by bursting a Douyin cookie.
 * These limits are the default operating envelope for one logged-in account.
 */
export const PROSPECT_GUARD = {
  maxKeywordsPerTask: 8,
  maxVideosPerTask: 10,
  maxCommentsPerVideo: 50,
  dailyVideoLimit: 60,
  dailyProfileLimit: 24,
  minVideoGapMs: 8_000,
  maxVideoGapMs: 18_000,
  minProfileGapMs: 25_000,
  captchaCooldownMs: 30 * 60_000,
  videoSkipTtlDays: 7,
  captchaSolveTimeoutMs: 180_000
} as const;

export type ProspectGuardState = {
  date: string;
  videosCrawled: number;
  profilesFetched: number;
  captchaBlockedUntil: string | null;
  lastVideoAt: string | null;
  lastProfileAt: string | null;
  captchaHits: number;
};

export function todayStamp(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function emptyProspectGuardState(now = new Date()): ProspectGuardState {
  return {
    date: todayStamp(now),
    videosCrawled: 0,
    profilesFetched: 0,
    captchaBlockedUntil: null,
    lastVideoAt: null,
    lastProfileAt: null,
    captchaHits: 0
  };
}

export function normalizeProspectGuardState(
  value: unknown,
  now = new Date()
): ProspectGuardState {
  const fresh = emptyProspectGuardState(now);
  if (!value || typeof value !== 'object') return fresh;
  const row = value as Record<string, unknown>;
  const date = typeof row.date === 'string' ? row.date : fresh.date;
  if (date !== fresh.date) return fresh;
  return {
    date,
    videosCrawled:
      typeof row.videosCrawled === 'number' ? row.videosCrawled : 0,
    profilesFetched:
      typeof row.profilesFetched === 'number' ? row.profilesFetched : 0,
    captchaBlockedUntil:
      typeof row.captchaBlockedUntil === 'string'
        ? row.captchaBlockedUntil
        : null,
    lastVideoAt: typeof row.lastVideoAt === 'string' ? row.lastVideoAt : null,
    lastProfileAt:
      typeof row.lastProfileAt === 'string' ? row.lastProfileAt : null,
    captchaHits: typeof row.captchaHits === 'number' ? row.captchaHits : 0
  };
}

export function jitterDelayMs(min: number, max: number): number {
  return min + Math.floor(Math.random() * Math.max(1, max - min));
}

export function remainingMs(iso: string | null, now = Date.now()): number {
  if (!iso) return 0;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, ts - now);
}

export function assertCrawlAllowed(
  state: ProspectGuardState,
  plannedVideos: number,
  now = new Date()
): void {
  const captchaWait = remainingMs(state.captchaBlockedUntil, now.getTime());
  if (captchaWait > 0) {
    throw new Error(
      `平台触发了验证码，账号冷却中，请 ${Math.ceil(captchaWait / 60000)} 分钟后再执行`
    );
  }
  const remaining = PROSPECT_GUARD.dailyVideoLimit - state.videosCrawled;
  if (remaining <= 0 && plannedVideos > 0) {
    throw new Error(
      `今日爬取额度已用完（${PROSPECT_GUARD.dailyVideoLimit} 个视频/天），请明天继续增量执行`
    );
  }
}

export function assertProfileAllowed(
  state: ProspectGuardState,
  now = new Date()
): void {
  const captchaWait = remainingMs(state.captchaBlockedUntil, now.getTime());
  if (captchaWait > 0) {
    throw new Error(
      `平台触发了验证码，账号冷却中，请 ${Math.ceil(captchaWait / 60000)} 分钟后再采集主页`
    );
  }
  if (state.profilesFetched >= PROSPECT_GUARD.dailyProfileLimit) {
    throw new Error(
      `今日主页采集额度已用完（${PROSPECT_GUARD.dailyProfileLimit} 次/天），请明天继续`
    );
  }
  const gap = remainingMs(
    state.lastProfileAt
      ? new Date(
          Date.parse(state.lastProfileAt) + PROSPECT_GUARD.minProfileGapMs
        ).toISOString()
      : null,
    now.getTime()
  );
  if (gap > 0) {
    throw new Error(
      `主页采集间隔过短，请 ${Math.ceil(gap / 1000)} 秒后再点下一位用户`
    );
  }
}

export function estimateCrawlMinutes(
  videoCount: number,
  keywordCount = 1
): number {
  if (videoCount <= 0) return 0;
  const perVideoSec =
    (PROSPECT_GUARD.minVideoGapMs + PROSPECT_GUARD.maxVideoGapMs) / 2000 + 12;
  return Math.max(1, Math.ceil((videoCount * keywordCount * perVideoSec) / 60));
}

export type CrawlQuotaPlan = {
  allowedVideos: number;
  trimmed: boolean;
  estimatedMinutes: number;
};

export function planCrawlQuota(
  remaining: number,
  plannedVideos: number
): CrawlQuotaPlan {
  const allowedVideos = Math.max(0, Math.min(remaining, plannedVideos));
  return {
    allowedVideos,
    trimmed: plannedVideos > allowedVideos,
    estimatedMinutes: estimateCrawlMinutes(allowedVideos)
  };
}

export function isRecentVideoCrawl(
  lastCrawledAt: Date,
  now = new Date(),
  ttlDays = PROSPECT_GUARD.videoSkipTtlDays
): boolean {
  return (
    now.getTime() - lastCrawledAt.getTime() < ttlDays * 24 * 60 * 60 * 1000
  );
}

export function extractProspectVideoId(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const fromUrl = trimmed.split('/video/')[1]?.split(/[?#]/)[0];
  const id = fromUrl || trimmed;
  return id || null;
}

export function isCaptchaInterrupt(message: string): boolean {
  return /验证码|CAPTCHA/i.test(message);
}

export type AccountHealthStatus =
  | 'needs_login'
  | 'cooling'
  | 'quota_exhausted'
  | 'healthy';

export type AccountHealth = {
  status: AccountHealthStatus;
  score: number;
  label: string;
  captchaHitsToday: number;
};

export function scoreAccountHealth(input: {
  needsLogin: boolean;
  captchaWaitMs: number;
  videosRemaining: number;
  captchaHitsToday: number;
}): AccountHealth {
  const captchaHitsToday = Math.max(0, input.captchaHitsToday);
  if (input.needsLogin) {
    return {
      status: 'needs_login',
      score: 0,
      label: '未登录',
      captchaHitsToday
    };
  }
  if (input.captchaWaitMs > 0) {
    return {
      status: 'cooling',
      score: Math.max(10, 40 - captchaHitsToday * 10),
      label: '验证码冷却',
      captchaHitsToday
    };
  }
  if (input.videosRemaining <= 0) {
    return {
      status: 'quota_exhausted',
      score: Math.max(20, 55 - captchaHitsToday * 10),
      label: '今日额度用尽',
      captchaHitsToday
    };
  }
  return {
    status: 'healthy',
    score: Math.max(50, 100 - captchaHitsToday * 20),
    label: captchaHitsToday > 0 ? '今日曾触发验证码' : '账号正常',
    captchaHitsToday
  };
}
