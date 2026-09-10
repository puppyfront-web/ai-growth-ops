import type { DatabaseClient } from './client.js';
import { decryptToken } from '@ai-growth-ops/providers';
import {
  aggregateProspectComments,
  asProspectEvidenceList,
  assertCrawlAllowed,
  assertProfileAllowed,
  DEFAULT_ICP_CONFIG,
  type AggregatedProspect,
  type IcpConfig,
  type ProspectUserScoreResult,
  type RawProspectVideo,
  extractProspectVideoId,
  isCaptchaInterrupt,
  isValidPhone,
  jitterDelayMs,
  mergeProspectEvidence,
  mergeSemanticScore,
  normalizePhone,
  passesProspectThreshold,
  PROSPECT_GUARD,
  remainingMs,
  scoreProspectUser
} from '@ai-growth-ops/shared';
import { loadIcpConfig } from './customer-profile.js';
import {
  claimProfileFetch,
  claimVideoCrawl,
  findProspectingAccount,
  loadProspectGuard,
  loadRecentCrawledVideoIds,
  markCaptchaBlocked,
  recordCrawledVideo
} from './prospect-guard.js';

const ICP_CONFIG_KEY = 'icp_config';
const SEMANTIC_BATCH_SIZE = 20;
const SEMANTIC_SCORING_TIMEOUT_MS = 90_000;

type TaskProgress = {
  phase:
    | 'starting'
    | 'searching'
    | 'crawling'
    | 'scoring'
    | 'saving'
    | 'done';
  currentKeyword?: string;
  keywordIndex?: number;
  keywordTotal?: number;
  videoIndex?: number;
  videoTotal?: number;
  currentVideoTitle?: string;
  scoringBatchIndex?: number;
  scoringBatchTotal?: number;
  updatedAt: string;
  warning?: string;
};

async function runWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('semantic scoring timeout')),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callBrowserRunner<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 180_000
): Promise<T> {
  const runnerUrl = process.env.BROWSER_RUNNER_URL || 'http://localhost:3200';
  const runnerSecret = process.env.BROWSER_RUNNER_SECRET || '';
  const resp = await fetchWithTimeout(
    `${runnerUrl}${path}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(runnerSecret ? { authorization: `Bearer ${runnerSecret}` } : {})
      },
      body: JSON.stringify(body)
    },
    timeoutMs
  );
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(
      `平台爬取失败 (${resp.status})${errText ? `: ${errText.slice(0, 200)}` : ''}`
    );
  }
  return resp.json() as Promise<T>;
}

async function updateTaskProgress(
  db: DatabaseClient,
  taskId: string,
  organizationId: string,
  executionToken: string,
  progress: TaskProgress,
  metrics?: {
    totalVideos?: number;
    totalComments?: number;
    totalCandidates?: number;
  }
) {
  await db.prospectingTask.updateMany({
    where: { id: taskId, organizationId, executionToken, status: 'running' },
    data: {
      ...(metrics?.totalVideos !== undefined
        ? { totalVideos: metrics.totalVideos }
        : {}),
      ...(metrics?.totalComments !== undefined
        ? { totalComments: metrics.totalComments }
        : {}),
      ...(metrics?.totalCandidates !== undefined
        ? { totalCandidates: metrics.totalCandidates }
        : {}),
      metadata: progress as never
    }
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 180_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function crawlKeywordComments(
  params: {
    platform: string;
    cookie: string;
    keyword: string;
    topNVideos: number;
    maxCommentsPerVideo: number;
    commentScrollRounds: number;
    skipContentIds?: Set<string>;
    claimVideoSlot?: () => Promise<boolean>;
  },
  onProgress?: (update: {
    progress: Partial<TaskProgress>;
    metrics?: {
      totalVideos?: number;
      totalComments?: number;
    };
  }) => Promise<void>,
  onVideoCrawled?: () => Promise<void>
): Promise<RawProspectVideo[]> {
  await onProgress?.({
    progress: {
      phase: 'searching',
      currentKeyword: params.keyword,
      updatedAt: new Date().toISOString()
    }
  });

  const searchPayload = await callBrowserRunner<{
    keyword: string;
    results?: Array<{ contentId: string; title: string; author: string }>;
    captchaRequired?: boolean;
    message?: string;
  }>('/assist/search-videos', {
    platform: params.platform,
    cookie: params.cookie,
    keyword: params.keyword,
    topN: params.topNVideos,
    headed: false
  });

  if (searchPayload.captchaRequired) {
    throw new Error(
      searchPayload.message ||
        '平台触发了验证码，请在浏览器助手中完成验证后重新执行任务'
    );
  }

  const items = (searchPayload.results ?? []).filter(
    (item) => !params.skipContentIds?.has(item.contentId)
  );
  if (items.length === 0) return [];

  await onProgress?.({
    progress: {
      phase: 'crawling',
      currentKeyword: params.keyword,
      videoTotal: items.length,
      videoIndex: 0,
      updatedAt: new Date().toISOString()
    }
  });

  const allResults: RawProspectVideo[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (params.claimVideoSlot && !(await params.claimVideoSlot())) {
      break;
    }
    await onProgress?.({
      progress: {
        phase: 'crawling',
        currentKeyword: params.keyword,
        videoIndex: i + 1,
        videoTotal: items.length,
        currentVideoTitle: item.title || `视频 ${i + 1}`,
        updatedAt: new Date().toISOString()
      }
    });

    try {
      const video = await callBrowserRunner<{
        contentId: string;
        title: string;
        author: string;
        url: string;
        comments: RawProspectVideo['comments'];
      }>('/assist/fetch-search-video-comments', {
        platform: params.platform,
        cookie: params.cookie,
        contentId: item.contentId,
        title: item.title,
        author: item.author,
        maxCommentsPerVideo: params.maxCommentsPerVideo,
        commentScrollRounds: params.commentScrollRounds,
        headed: false
      });
      allResults.push({
        contentId: video.contentId,
        title: video.title,
        author: video.author,
        url: video.url,
        comments: video.comments
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isCaptchaInterrupt(message)) throw error;
      allResults.push({
        contentId: item.contentId,
        title: item.title,
        author: item.author,
        url:
          params.platform === 'douyin'
            ? `https://www.douyin.com/video/${item.contentId}`
            : undefined,
        comments: []
      });
    }

    const totalComments = allResults.reduce(
      (sum, video) => sum + (video.comments?.length ?? 0),
      0
    );
    await onProgress?.({
      progress: {
        phase: 'crawling',
        currentKeyword: params.keyword,
        videoIndex: i + 1,
        videoTotal: items.length,
        currentVideoTitle: item.title || `视频 ${i + 1}`,
        updatedAt: new Date().toISOString()
      },
      metrics: {
        totalVideos: allResults.length,
        totalComments
      }
    });

    if (i < items.length - 1) {
      await sleep(
        jitterDelayMs(
          PROSPECT_GUARD.minVideoGapMs,
          PROSPECT_GUARD.maxVideoGapMs
        )
      );
    }
    await onVideoCrawled?.();
  }

  return allResults;
}

type SemanticScore = {
  userKey?: unknown;
  relevanceScore?: unknown;
  leadLevel?: unknown;
  intent?: unknown;
  summary?: unknown;
  matchedKeywords?: unknown;
};

/**
 * Semantic scoring is an enhancement over the rule engine: any skill failure
 * leaves the deterministic scores untouched so a task never fails on the LLM.
 */
async function scoreProspectsSemantically(
  prospects: AggregatedProspect[],
  keywords: string[],
  highIntentKeywords: string[],
  onBatchProgress?: (batchIndex: number, batchTotal: number) => Promise<void>
): Promise<Map<string, SemanticScore>> {
  const byUserKey = new Map<string, SemanticScore>();
  if (prospects.length === 0) return byUserKey;

  let runner: { run: <I, O>(req: unknown) => Promise<{ status: string; output?: O }> };
  try {
    const { getSharedSkillRunner } = await import('@ai-growth-ops/skills');
    runner = getSharedSkillRunner() as typeof runner;
  } catch {
    return byUserKey;
  }

  const batchTotal = Math.ceil(prospects.length / SEMANTIC_BATCH_SIZE);

  for (let i = 0; i < prospects.length; i += SEMANTIC_BATCH_SIZE) {
    const batchIndex = Math.floor(i / SEMANTIC_BATCH_SIZE) + 1;
    await onBatchProgress?.(batchIndex, batchTotal);

    const batch = prospects.slice(i, i + SEMANTIC_BATCH_SIZE);
    try {
      const result = await runWithTimeout(
        runner.run<unknown, { results?: SemanticScore[] }>({
          skillName: 'prospect-relevance-score',
          input: {
            keywords,
            highIntentKeywords,
            users: batch.map((prospect) => ({
              userKey: prospect.userKey,
              userNickname: prospect.userNickname ?? '',
              sourceVideoTitle: prospect.sourceVideoTitle ?? '',
              comments: prospect.evidence.map((item) => item.content)
            }))
          }
        }),
        SEMANTIC_SCORING_TIMEOUT_MS
      );

      if (result.status !== 'success') continue;
      for (const score of result.output?.results ?? []) {
        if (typeof score.userKey === 'string') {
          byUserKey.set(score.userKey, score);
        }
      }
    } catch {
      /* rule scores stay authoritative for this batch */
    }
  }

  return byUserKey;
}

export async function executeProspectingTask(
  db: DatabaseClient,
  taskId: string,
  organizationId: string,
  userId: string,
  executionToken: string,
  options: { forceRecrawl?: boolean } = {}
) {
  const task = await db.prospectingTask.findFirst({
    where: { id: taskId, organizationId, executionToken }
  });
  if (!task) throw new Error('获客任务不存在');
  if (!['failed', 'running'].includes(task.status)) {
    throw new Error(`任务状态 ${task.status} 不可执行`);
  }

  let totalVideos = 0;
  let totalComments = 0;
  let totalCandidates = 0;
  let accountId: string | null = null;

  try {
    if (task.status === 'failed') {
      const claim = await db.prospectingTask.updateMany({
        where: {
          id: task.id,
          organizationId,
          executionToken,
          status: 'failed'
        },
        data: {
          status: 'running',
          startedAt: new Date(),
          finishedAt: null,
          lastError: null
        }
      });
      if (claim.count !== 1) {
        throw new Error('任务已被其他请求执行');
      }
    }

    const keywords = Array.isArray(task.keywords)
      ? task.keywords.map(String).filter(Boolean)
      : [];
    if (keywords.length === 0) throw new Error('请至少设置一个关键词');

    const account = await findProspectingAccount(
      db,
      organizationId,
      task.platform
    );
    if (!account) {
      throw new Error(
        `未找到 ${task.platform} 平台的已登录账号，请先在集成配置中扫码登录`
      );
    }
    accountId = account.id;

    const cookie = decryptToken(account.cookieRef);
    let icp: IcpConfig;
    try {
      icp = await loadIcpConfig(db, organizationId);
    } catch {
      icp = DEFAULT_ICP_CONFIG;
    }

    const existingCandidates = await db.prospectCandidate.findMany({
      where: { prospectingTaskId: task.id }
    });
    const existingByUserKey = new Map(
      existingCandidates.map((row) => [row.userKey, row])
    );
    const skipContentIds = collectedVideoIds(existingCandidates);
    if (!options.forceRecrawl) {
      const recentIds = await loadRecentCrawledVideoIds(
        db,
        organizationId,
        task.platform
      );
      for (const id of recentIds) skipContentIds.add(id);
    }

    let guard = await loadProspectGuard(db, organizationId, account.id);
    const plannedVideos =
      keywords.length *
      Math.min(task.topNVideos, PROSPECT_GUARD.maxVideosPerTask);
    assertCrawlAllowed(guard, plannedVideos);
    const remainingVideos = Math.max(
      0,
      PROSPECT_GUARD.dailyVideoLimit - guard.videosCrawled
    );
    const topNVideos = Math.min(
      task.topNVideos,
      PROSPECT_GUARD.maxVideosPerTask,
      remainingVideos
    );

    let quotaExhausted = false;

    await updateTaskProgress(
      db,
      task.id,
      organizationId,
      executionToken,
      {
        phase: 'starting',
        keywordTotal: keywords.length,
        updatedAt: new Date().toISOString()
      }
    );

    const prospectsByUser = new Map<
      string,
      { prospect: AggregatedProspect; score: ProspectUserScoreResult }
    >();

    for (let keywordIndex = 0; keywordIndex < keywords.length; keywordIndex++) {
      const keyword = keywords[keywordIndex]!;
      await updateTaskProgress(
        db,
        task.id,
        organizationId,
        executionToken,
        {
          phase: 'crawling',
          currentKeyword: keyword,
          keywordIndex: keywordIndex + 1,
          keywordTotal: keywords.length,
          updatedAt: new Date().toISOString()
        },
        { totalVideos, totalComments, totalCandidates }
      );

      const videos = await crawlKeywordComments(
        {
          platform: task.platform,
          cookie,
          keyword,
          topNVideos,
          maxCommentsPerVideo: Math.min(
            task.maxCommentsPerVideo,
            PROSPECT_GUARD.maxCommentsPerVideo
          ),
          commentScrollRounds: task.commentScrollRounds,
          skipContentIds,
          claimVideoSlot: async () => {
            const ok = await claimVideoCrawl(
              db,
              organizationId,
              account.id
            );
            if (!ok) quotaExhausted = true;
            return ok;
          }
        },
        async ({ progress, metrics }) => {
          await updateTaskProgress(
            db,
            task.id,
            organizationId,
            executionToken,
            {
              ...progress,
              keywordIndex: keywordIndex + 1,
              keywordTotal: keywords.length,
              currentKeyword: keyword,
              updatedAt: new Date().toISOString()
            } as TaskProgress,
            {
              totalVideos: totalVideos + (metrics?.totalVideos ?? 0),
              totalComments: totalComments + (metrics?.totalComments ?? 0),
              totalCandidates
            }
          );
        }
      );

      totalVideos += videos.length;
      totalComments += videos.reduce(
        (sum, video) => sum + (video.comments?.length ?? 0),
        0
      );
      for (const video of videos) {
        if (typeof video.contentId === 'string' && video.contentId) {
          skipContentIds.add(video.contentId);
          await recordCrawledVideo(db, {
            organizationId,
            platform: task.platform,
            videoId: video.contentId,
            commentCount: video.comments?.length ?? 0,
            taskId: task.id
          });
        }
      }

      if (quotaExhausted) break;

      await updateTaskProgress(
        db,
        task.id,
        organizationId,
        executionToken,
        {
          phase: 'scoring',
          currentKeyword: keyword,
          keywordIndex: keywordIndex + 1,
          keywordTotal: keywords.length,
          updatedAt: new Date().toISOString()
        },
        { totalVideos, totalComments, totalCandidates }
      );

      const prospects = aggregateProspectComments(videos, keyword);
      const semanticScores = await scoreProspectsSemantically(
        prospects,
        keywords,
        icp.highIntentKeywords,
        async (batchIndex, batchTotal) => {
          await updateTaskProgress(
            db,
            task.id,
            organizationId,
            executionToken,
            {
              phase: 'scoring',
              currentKeyword: keyword,
              keywordIndex: keywordIndex + 1,
              keywordTotal: keywords.length,
              scoringBatchIndex: batchIndex,
              scoringBatchTotal: batchTotal,
              updatedAt: new Date().toISOString()
            },
            { totalVideos, totalComments, totalCandidates }
          );
        }
      );

      for (const prospect of prospects) {
        const ruleScore = scoreProspectUser({
          contents: prospect.evidence.map((item) => item.content),
          keywords,
          icpHighIntentKeywords: icp.highIntentKeywords,
          icpTargetRoles: icp.targetRoles,
          icpTargetIndustries: icp.targetIndustries,
          icpExcludedKeywords: icp.excludedKeywords,
          videoTitle: prospect.sourceVideoTitle ?? undefined,
          profileText: prospect.userNickname ?? undefined
        });
        const score = mergeSemanticScore(
          ruleScore,
          semanticScores.get(prospect.userKey)
        );

        if (!passesProspectThreshold(score, task.minRelevanceScore)) continue;

        // The same user can surface under several keywords; keep their best hit.
        const existing = prospectsByUser.get(prospect.userKey);
        if (existing && existing.score.relevanceScore >= score.relevanceScore) {
          continue;
        }
        prospectsByUser.set(prospect.userKey, { prospect, score });
      }
    }

    await updateTaskProgress(
      db,
      task.id,
      organizationId,
      executionToken,
      {
        phase: 'saving',
        keywordTotal: keywords.length,
        updatedAt: new Date().toISOString()
      },
      { totalVideos, totalComments, totalCandidates }
    );

    for (const { prospect, score } of prospectsByUser.values()) {
      await upsertProspectCandidate(db, {
        taskId: task.id,
        organizationId,
        platform: task.platform,
        prospect,
        score,
        existing: existingByUserKey.get(prospect.userKey)
      });
    }

    const saved = await db.prospectCandidate.findMany({
      where: { prospectingTaskId: task.id },
      select: { commentCount: true, evidence: true }
    });
    totalCandidates = saved.length;
    totalComments = saved.reduce((sum, row) => sum + row.commentCount, 0);
    totalVideos = Math.max(totalVideos, uniqueVideoCount(saved));

    const warnings: string[] = [];
    if (quotaExhausted) {
      warnings.push('今日额度已用完，已保存当前结果，明天可增量执行');
    }
    if (totalCandidates === 0) {
      warnings.push(
        totalComments === 0
          ? '未抓取到评论，可能是 Cookie 失效、触发验证码或搜索无结果，请检查抖音登录后重新执行'
          : '已抓取评论但未找到达到阈值的潜客，可调低「最低相关度」后重新执行'
      );
    }
    const zeroResultWarning = warnings.join('。') || undefined;

    const completed = await db.prospectingTask.updateMany({
      where: { id: task.id, organizationId, executionToken, status: 'running' },
      data: {
        status: 'completed',
        executionToken: null,
        finishedAt: new Date(),
        totalVideos,
        totalComments,
        totalCandidates,
        metadata: {
          phase: 'done',
          keywordTotal: keywords.length,
          updatedAt: new Date().toISOString(),
          ...(zeroResultWarning ? { warning: zeroResultWarning } : {})
        } as never
      }
    });
    if (completed.count !== 1) {
      throw new Error('任务执行权已失效');
    }

    return db.prospectingTask.findUniqueOrThrow({
      where: { id: task.id },
      include: {
        candidates: { orderBy: { relevanceScore: 'desc' } }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isCaptchaInterrupt(message) && accountId) {
      await markCaptchaBlocked(db, organizationId, accountId).catch(
        () => undefined
      );
    }
    await db.prospectingTask.updateMany({
      where: { id: task.id, organizationId, executionToken, status: 'running' },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        lastError: message,
        totalVideos,
        totalComments,
        totalCandidates,
        metadata: {
          ...asRecord(task.metadata),
          phase: isCaptchaInterrupt(message) ? 'captcha' : 'failed',
          captchaRequired: isCaptchaInterrupt(message),
          updatedAt: new Date().toISOString()
        } as never
      }
    });
    throw error;
  }
}

function collectedVideoIds(
  rows: Array<{
    sourcePostId?: string | null;
    sourceVideoUrl?: string | null;
    evidence: unknown;
  }>
): Set<string> {
  const ids = new Set<string>();
  const remember = (value: string | null | undefined) => {
    const id = extractProspectVideoId(value);
    if (id) ids.add(id);
  };
  for (const row of rows) {
    remember(row.sourcePostId);
    remember(row.sourceVideoUrl);
    for (const item of asProspectEvidenceList(row.evidence)) {
      remember(item.sourceVideoUrl);
    }
  }
  return ids;
}

function uniqueVideoCount(
  rows: Array<{ evidence: unknown; sourceVideoUrl?: string | null }>
): number {
  const urls = new Set<string>();
  for (const row of rows) {
    if (row.sourceVideoUrl) urls.add(row.sourceVideoUrl);
    for (const item of asProspectEvidenceList(row.evidence)) {
      if (item.sourceVideoUrl) urls.add(item.sourceVideoUrl);
    }
  }
  return urls.size;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function upsertProspectCandidate(
  db: DatabaseClient,
  input: {
    taskId: string;
    organizationId: string;
    platform: string;
    prospect: AggregatedProspect;
    score: ProspectUserScoreResult;
    existing?: {
      id: string;
      customerId: string | null;
      evidence: unknown;
      relevanceScore: number;
      leadLevel: string;
      content: string;
      userNickname: string | null;
      userHomepage: string | null;
      avatarUrl: string | null;
      metadata: unknown;
    };
  }
) {
  const { prospect, score, existing } = input;
  if (!existing) {
    await db.prospectCandidate.create({
      data: {
        prospectingTaskId: input.taskId,
        organizationId: input.organizationId,
        platform: input.platform as never,
        keyword: prospect.keyword,
        userKey: prospect.userKey,
        externalUserId: prospect.externalUserId,
        userNickname: prospect.userNickname,
        userHomepage: prospect.userHomepage,
        avatarUrl: prospect.avatarUrl,
        content: prospect.evidence[0]?.content ?? '',
        commentCount: prospect.evidence.length,
        evidence: prospect.evidence as never,
        sourceVideoTitle: prospect.sourceVideoTitle,
        sourceVideoUrl: prospect.sourceVideoUrl,
        sourceVideoAuthor: prospect.sourceVideoAuthor,
        sourcePostId: prospect.sourcePostId,
        relevanceScore: score.relevanceScore,
        leadLevel: score.leadLevel,
        scoreSource: score.scoreSource,
        intent: score.intent,
        summary: score.summary,
        matchedKeywords: score.matchedKeywords as never
      }
    });
    return;
  }

  const evidence = mergeProspectEvidence(
    asProspectEvidenceList(existing.evidence),
    prospect.evidence
  );
  const keepExistingScore = existing.relevanceScore >= score.relevanceScore;

  await db.prospectCandidate.update({
    where: { id: existing.id },
    data: {
      userNickname: existing.userNickname ?? prospect.userNickname,
      userHomepage: existing.userHomepage ?? prospect.userHomepage,
      avatarUrl: existing.avatarUrl ?? prospect.avatarUrl,
      content: keepExistingScore
        ? existing.content
        : (prospect.evidence[0]?.content ?? existing.content),
      commentCount: evidence.length,
      evidence: evidence as never,
      relevanceScore: keepExistingScore
        ? existing.relevanceScore
        : score.relevanceScore,
      leadLevel: keepExistingScore ? existing.leadLevel : score.leadLevel,
      scoreSource: keepExistingScore ? undefined : score.scoreSource,
      intent: keepExistingScore ? undefined : score.intent,
      summary: keepExistingScore ? undefined : score.summary,
      matchedKeywords: keepExistingScore
        ? undefined
        : (score.matchedKeywords as never)
    }
  });
}

function candidateHomepage(candidate: {
  userHomepage: string | null;
  externalUserId: string | null;
  platform: string;
}): string | null {
  if (candidate.userHomepage) return candidate.userHomepage;
  if (candidate.platform === 'douyin' && candidate.externalUserId) {
    return `https://www.douyin.com/user/${candidate.externalUserId}`;
  }
  return null;
}

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

async function loadPlatformAccount(
  db: DatabaseClient,
  organizationId: string,
  platform: string
) {
  const account = await findProspectingAccount(db, organizationId, platform);
  if (!account) {
    throw new Error(
      `未找到 ${platform} 平台的已登录账号，请先在集成配置中扫码登录`
    );
  }
  return account;
}

async function patchCandidateMetadata(
  db: DatabaseClient,
  candidateId: string,
  organizationId: string,
  patch: Record<string, unknown>
) {
  const candidate = await db.prospectCandidate.findFirst({
    where: { id: candidateId, organizationId }
  });
  if (!candidate) throw new Error('潜客不存在');
  const metadata = { ...asRecord(candidate.metadata), ...patch };
  await db.prospectCandidate.update({
    where: { id: candidate.id },
    data: { metadata: metadata as never }
  });
  return candidate;
}

export async function queueProspectProfileEnrich(
  db: DatabaseClient,
  candidateId: string,
  organizationId: string
) {
  const candidate = await db.prospectCandidate.findFirst({
    where: { id: candidateId, organizationId }
  });
  if (!candidate) throw new Error('潜客不存在');
  if (!candidateHomepage(candidate)) {
    throw new Error('该用户没有可打开的主页链接');
  }
  await db.prospectCandidate.update({
    where: { id: candidate.id },
    data: {
      metadata: {
        ...asRecord(candidate.metadata),
        enrichStatus: 'queued',
        enrichError: null,
        enrichQueuedAt: new Date().toISOString()
      } as never
    }
  });
  return candidate;
}

export async function markProspectEnrichFailed(
  db: DatabaseClient,
  candidateId: string,
  organizationId: string,
  error: string
) {
  await patchCandidateMetadata(db, candidateId, organizationId, {
    enrichStatus: 'failed',
    enrichError: error
  });
}

export async function enrichProspectProfile(
  db: DatabaseClient,
  candidateId: string,
  organizationId: string,
  userId: string
) {
  const candidate = await db.prospectCandidate.findFirst({
    where: { id: candidateId, organizationId }
  });
  if (!candidate) throw new Error('潜客不存在');

  await db.prospectCandidate.update({
    where: { id: candidate.id },
    data: {
      metadata: {
        ...asRecord(candidate.metadata),
        enrichStatus: 'running',
        enrichError: null
      } as never
    }
  });

  const homepage = candidateHomepage(candidate);
  if (!homepage) throw new Error('该用户没有可打开的主页链接');

  const account = await loadPlatformAccount(
    db,
    organizationId,
    candidate.platform
  );
  const guard = await loadProspectGuard(db, organizationId, account.id);
  const captchaWait = remainingMs(guard.captchaBlockedUntil);
  if (captchaWait > 0) {
    throw new Error(
      `平台触发了验证码，账号冷却中，请 ${Math.ceil(captchaWait / 60000)} 分钟后再采集主页`
    );
  }
  if (guard.profilesFetched >= PROSPECT_GUARD.dailyProfileLimit) {
    throw new Error(
      `今日主页采集额度已用完（${PROSPECT_GUARD.dailyProfileLimit} 次/天），请明天继续`
    );
  }
  const profileGap = remainingMs(
    guard.lastProfileAt
      ? new Date(
          Date.parse(guard.lastProfileAt) + PROSPECT_GUARD.minProfileGapMs
        ).toISOString()
      : null
  );
  if (profileGap > 0) await sleep(profileGap);
  const claimed = await claimProfileFetch(db, organizationId, account.id);
  if (!claimed) {
    assertProfileAllowed(await loadProspectGuard(db, organizationId, account.id));
    throw new Error(
      `今日主页采集额度已用完（${PROSPECT_GUARD.dailyProfileLimit} 次/天），请明天继续`
    );
  }

  const cookie = decryptToken(account.cookieRef);
  try {
    const profile = await callBrowserRunner<ProspectUserProfile>(
      '/assist/fetch-user-profile',
      {
        platform: candidate.platform,
        cookie,
        homepage,
        headed: false
      },
      90_000
    );

    const previous = asRecord(candidate.metadata);
    const metadata = {
      ...previous,
      profile: {
        ...profile,
        homepage,
        fetchedAt: new Date().toISOString()
      },
      enrichStatus: null,
      enrichError: null
    };

    return db.prospectCandidate.update({
      where: { id: candidate.id },
      data: {
        metadata: metadata as never,
        userNickname: candidate.userNickname || profile.nickname,
        userHomepage: candidate.userHomepage || homepage
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isCaptchaInterrupt(message)) {
      await markCaptchaBlocked(db, organizationId, account.id);
    }
    await markProspectEnrichFailed(db, candidateId, organizationId, message);
    throw error;
  }
}

export async function convertProspectToCustomer(
  db: DatabaseClient,
  candidateId: string,
  organizationId: string,
  userId: string,
  input: {
    phone?: string;
    displayName?: string;
    company?: string;
    role?: string;
    intent?: string;
    confirmDuplicate?: boolean;
  }
) {
  const rawPhone = input.phone?.trim() ?? '';
  if (rawPhone && !isValidPhone(rawPhone)) {
    throw new Error('请输入有效的手机号');
  }
  const normalizedPhone = rawPhone ? normalizePhone(rawPhone) : '';
  const channelMap: Record<string, string> = {
    douyin: 'douyin',
    xiaohongshu: 'xiaohongshu',
    wechat_official: 'wechat_official',
    wechat_channels: 'wechat_channels',
    baijiahao: 'baijiahao',
    zhihu: 'zhihu'
  };

  return db.$transaction(async (tx) => {
    const lockValue = normalizedPhone || `prospect:${candidateId}`;
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${`${organizationId}:${lockValue}`})
      )
    `;
    const candidate = await tx.prospectCandidate.findFirst({
      where: { id: candidateId, organizationId }
    });
    if (!candidate) throw new Error('潜客不存在');
    if (candidate.customerId) throw new Error('该潜客已转入客户库');

    const existingByUser = await tx.customer.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        metadata: {
          path: ['prospectUserKey'],
          equals: candidate.userKey
        }
      }
    });

    if (normalizedPhone && !existingByUser) {
      const duplicates = await tx.customer.findMany({
        where: {
          organizationId,
          phone: normalizedPhone,
          deletedAt: null
        }
      });
      if (duplicates.length > 0 && !input.confirmDuplicate) {
        const err = new Error('duplicate') as Error & {
          code: string;
          duplicates: typeof duplicates;
        };
        err.code = 'duplicate';
        err.duplicates = duplicates;
        throw err;
      }
    }

    const evidence = asProspectEvidenceList(candidate.evidence);
    const commentsNote = evidence
      .map((item, index) => {
        const source = item.sourceVideoTitle ? `（${item.sourceVideoTitle}）` : '';
        return `${index + 1}. ${item.content}${source}`;
      })
      .join('\n');
    const profile = asRecord(asRecord(candidate.metadata).profile);
    const profileNote = [
      typeof profile.signature === 'string' ? `简介：${profile.signature}` : null,
      typeof profile.followerCount === 'number'
        ? `粉丝 ${profile.followerCount}`
        : null,
      typeof profile.location === 'string' ? `IP ${profile.location}` : null
    ]
      .filter(Boolean)
      .join(' · ');

    const reused = Boolean(existingByUser);
    const customer =
      existingByUser ??
      (await tx.customer.create({
        data: {
          organizationId,
          userId,
          displayName:
            input.displayName?.trim() || candidate.userNickname || '潜客',
          phone: normalizedPhone,
          company: input.company?.trim() || '待补充',
          role: input.role?.trim() || '待补充',
          intent:
            input.intent?.trim() ||
            candidate.summary ||
            candidate.content.slice(0, 500) ||
            '来自关键词获客',
          channel: (channelMap[candidate.platform] ?? 'other') as never,
          sourceNote: [
            `关键词获客：${candidate.keyword}`,
            candidate.userHomepage
              ? `主页：${candidate.userHomepage}`
              : null,
            candidate.sourceVideoTitle
              ? `来源视频：${candidate.sourceVideoTitle}`
              : null,
            profileNote || null,
            commentsNote ? `评论：\n${commentsNote}` : null
          ]
            .filter(Boolean)
            .join('\n'),
          tags: normalizedPhone ? ['获客转入'] : ['获客转入', '待跟进'],
          metadata: {
            prospectCandidateId: candidate.id,
            prospectingTaskId: candidate.prospectingTaskId,
            prospectUserKey: candidate.userKey,
            relevanceScore: candidate.relevanceScore,
            leadLevel: candidate.leadLevel,
            pendingContact: !normalizedPhone
          } as never,
          activities: {
            create: {
              action: 'converted_from_prospect',
              note: normalizedPhone
                ? '从关键词获客转入'
                : '从关键词获客转入，手机号待人工跟进补充'
            }
          }
        }
      }));

    if (reused) {
      await tx.customerActivity.create({
        data: {
          customerId: customer.id,
          action: 'converted_from_prospect',
          note: `同一平台用户再次从获客任务关联（${candidate.keyword}）`
        }
      });
    }

    const claimed = await tx.prospectCandidate.updateMany({
      where: {
        organizationId,
        userKey: candidate.userKey,
        customerId: null
      },
      data: { customerId: customer.id }
    });
    if (claimed.count < 1) {
      throw new Error('该潜客已被其他请求转入客户库');
    }

    await tx.prospectCandidate.update({
      where: { id: candidate.id },
      data: {
        metadata: {
          ...asRecord(candidate.metadata),
          convertedAt: new Date().toISOString()
        } as never
      }
    });

    return {
      customer,
      candidate: { ...candidate, customerId: customer.id },
      reused
    };
  });
}
