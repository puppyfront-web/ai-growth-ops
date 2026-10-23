import type { DatabaseClient } from './client.js';
import { decryptToken } from '@ai-growth-ops/providers';
import {
  aggregateProspectComments,
  asProspectEvidenceList,
  assertCrawlAllowed,
  assertProfileAllowed,
  buildZeroResultWarning,
  DEFAULT_ICP_CONFIG,
  DEFAULT_ICP_FOR_PROSPECTING,
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
  getBrowserRunnerConfig,
  getBrowserRunnerHeaders,
  defaultNextActionAt,
  normalizePhone,
  passesProspectThreshold,
  PROSPECT_GUARD,
  remainingMs,
  scoreProspectUser,
  secUidFromHomepage,
  mergeProspectAttributions,
  prospectingPlanSchema,
  type ProspectAttribution,
  type ProspectingIntent
} from '@ai-growth-ops/shared';
import { loadIcpConfig } from './customer-profile.js';
import { resolveLlmClientFromDb } from './llm-config.js';
import { findCustomerByAcquisitionIdentity } from './customer-crm.js';
import { applyAssignmentRules } from './assignment.js';
import {
  claimProfileFetch,
  claimVideoCrawl,
  findProspectingAccount,
  loadProspectGuard,
  loadRecentCrawledVideoIds,
  markCaptchaBlocked,
  recordCrawledVideo
} from './prospect-guard.js';

// Keep well under the 4096-token output cap: each user result carries Chinese
// intent/summary text (~200 tokens), so larger batches get truncated mid-JSON
// and the whole batch silently falls back to rule scores.
const SEMANTIC_BATCH_SIZE = 8;
const SEMANTIC_SCORING_TIMEOUT_MS = 90_000;

type TaskProgress = {
  phase: 'starting' | 'searching' | 'crawling' | 'scoring' | 'saving' | 'done';
  currentStrategy?: string;
  strategyIndex?: number;
  strategyTotal?: number;
  videoIndex?: number;
  videoTotal?: number;
  currentVideoTitle?: string;
  scoringBatchIndex?: number;
  scoringBatchTotal?: number;
  updatedAt: string;
  warning?: string;
};

function evidenceKey(item: { content: string; sourceVideoUrl: string | null }) {
  return `${item.sourceVideoUrl ?? ''}:${item.content.slice(0, 120)}`;
}

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
  const runner = getBrowserRunnerConfig();
  const resp = await fetchWithTimeout(
    `${runner.url}${path}`,
    {
      method: 'POST',
      headers: getBrowserRunnerHeaders({ 'content-type': 'application/json' }),
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

async function crawlSearchQueryComments(
  params: {
    platform: string;
    cookie: string;
    query: string;
    topNVideos: number;
    maxCommentsPerVideo: number;
    commentScrollRounds: number;
    skipContentIds?: Set<string>;
    claimVideoSlot?: () => Promise<boolean>;
    /** 按账号持久化浏览器 Profile 的键，降低采集浏览器被风控识别的概率 */
    profileKey?: string;
  },
  onProgress?: (update: {
    progress: Partial<TaskProgress>;
    metrics?: {
      totalVideos?: number;
      totalComments?: number;
    };
  }) => Promise<void>,
  onVideoCrawled?: () => Promise<void>
): Promise<{
  videos: RawProspectVideo[];
  /** 搜索空结果时 browser-runner 返回的原因码，用于生成准确的零结果警告。 */
  searchEmptyReason?: string;
}> {
  await onProgress?.({
    progress: {
      phase: 'searching',
      updatedAt: new Date().toISOString()
    }
  });

  const searchPayload = await callBrowserRunner<{
    keyword: string;
    results?: Array<{
      contentId: string;
      title: string;
      author: string;
      awemeType?: number;
    }>;
    captchaRequired?: boolean;
    message?: string;
    reasonCode?: string;
  }>('/assist/search-videos', {
    platform: params.platform,
    cookie: params.cookie,
    keyword: params.query,
    topN: params.topNVideos,
    headed: false,
    ...(params.profileKey ? { profileKey: params.profileKey } : {})
  });

  if (searchPayload.captchaRequired) {
    throw new Error(
      searchPayload.message ||
        '平台触发了验证码，请在浏览器助手中完成验证后重新执行任务'
    );
  }

  const searchResults = searchPayload.results ?? [];
  const items = searchResults.filter(
    (item) => !params.skipContentIds?.has(item.contentId)
  );
  if (items.length === 0) {
    return {
      videos: [],
      searchEmptyReason:
        searchResults.length > 0
          ? // 搜索有结果但全被「近 N 天已抓」去重跳过，与搜索失败区分开
            'SEARCH_ALL_SKIPPED'
          : (searchPayload.reasonCode ?? 'SEARCH_UNKNOWN')
    };
  }

  await onProgress?.({
    progress: {
      phase: 'crawling',
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
        awemeType: item.awemeType,
        maxCommentsPerVideo: params.maxCommentsPerVideo,
        commentScrollRounds: params.commentScrollRounds,
        headed: false,
        ...(params.profileKey ? { profileKey: params.profileKey } : {})
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
            ? `https://www.douyin.com/${item.awemeType === 2 ? 'note' : 'video'}/${encodeURIComponent(item.contentId)}`
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

  return { videos: allResults };
}

type SemanticScore = {
  userKey?: unknown;
  relevanceScore?: unknown;
  leadLevel?: unknown;
  intent?: unknown;
  summary?: unknown;
  matchedKeywords?: unknown;
  audienceFit?: unknown;
  needStrength?: unknown;
  buyingIntent?: unknown;
  evidenceQuality?: unknown;
  buyingStage?: unknown;
  confidence?: unknown;
  riskFlags?: unknown;
};

/**
 * Semantic scoring is an enhancement over the rule engine: any skill failure
 * leaves the deterministic scores untouched so a task never fails on the LLM.
 */
const LLM_NOT_CONFIGURED_MESSAGE = 'AI 服务未配置';

export function filterPreviouslySeenProspects<T extends { userKey: string }>(
  prospects: T[],
  previouslySeen: ReadonlySet<string>
): { prospects: T[]; skippedUserKeys: Set<string> } {
  const skippedUserKeys = new Set<string>();
  return {
    prospects: prospects.filter((prospect) => {
      if (!previouslySeen.has(prospect.userKey)) return true;
      skippedUserKeys.add(prospect.userKey);
      return false;
    }),
    skippedUserKeys
  };
}

async function scoreProspectsSemantically(
  db: DatabaseClient,
  organizationId: string,
  prospects: AggregatedProspect[],
  requirement: string,
  intent: ProspectingIntent,
  searchQueries: string[],
  highIntentKeywords: string[],
  onBatchProgress?: (batchIndex: number, batchTotal: number) => Promise<void>
): Promise<{
  scores: Map<string, SemanticScore>;
  llmUnavailable: boolean;
}> {
  const byUserKey = new Map<string, SemanticScore>();
  if (prospects.length === 0)
    return { scores: byUserKey, llmUnavailable: false };

  let runner: {
    run: <I, O>(req: {
      skillName: string;
      input: I;
      llmClient?: unknown;
    }) => Promise<{ status: string; output?: O; error?: string }>;
  };
  try {
    const { getSharedSkillRunner } = await import('@ai-growth-ops/skills');
    runner = getSharedSkillRunner() as typeof runner;
  } catch {
    return { scores: byUserKey, llmUnavailable: false };
  }

  // Prefer the org-level LLM config from the integrations UI; falls back to
  // env-based createLLMClient() inside the runner when absent.
  const orgLlm = await resolveLlmClientFromDb(db, organizationId).catch(
    () => undefined
  );
  let llmUnavailable = false;

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
            requirement,
            intent,
            searchQueries,
            highIntentKeywords,
            users: batch.map((prospect) => ({
              userKey: prospect.userKey,
              userNickname: prospect.userNickname ?? '',
              sourceVideoTitle: prospect.sourceVideoTitle ?? '',
              comments: prospect.evidence.map((item) => item.content)
            }))
          },
          llmClient: orgLlm
        }),
        SEMANTIC_SCORING_TIMEOUT_MS
      );

      if (result.status !== 'success') {
        // Surface the reason once — a missing key silently degraded ALL
        // scoring to keyword rules before, with nothing in the logs.
        console.warn(
          `[prospecting] 语义打分不可用，本批次沿用规则评分: ${result.error ?? result.status}`
        );
        if (result.error?.includes(LLM_NOT_CONFIGURED_MESSAGE)) {
          llmUnavailable = true;
        }
        continue;
      }
      for (const score of result.output?.results ?? []) {
        if (typeof score.userKey === 'string') {
          byUserKey.set(score.userKey, score);
        }
      }
    } catch (err) {
      console.warn(
        '[prospecting] 语义打分调用失败，本批次沿用规则评分:',
        err instanceof Error ? err.message : String(err)
      );
      if (
        err instanceof Error &&
        err.message.includes(LLM_NOT_CONFIGURED_MESSAGE)
      ) {
        llmUnavailable = true;
      }
    }
  }

  return { scores: byUserKey, llmUnavailable };
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

    const parsedPlan = prospectingPlanSchema.safeParse(task.strategyPlan);
    if (!parsedPlan.success || !task.requirement) {
      throw new Error('获客策略计划无效，请重新创建任务');
    }
    const plan = parsedPlan.data;
    const enabledStrategies = plan.strategies.filter(
      (strategy) => strategy.enabled
    );
    const executionUnits = enabledStrategies.flatMap((strategy) => {
      const queries = strategy.queries.slice(0, strategy.budget.maxQueries);
      return queries
        .map((query, index) => ({
          strategy,
          query,
          maxVideos:
            Math.floor(strategy.budget.maxVideos / queries.length) +
            (index < strategy.budget.maxVideos % queries.length ? 1 : 0)
        }))
        .filter((unit) => unit.maxVideos > 0);
    });
    if (executionUnits.length === 0) throw new Error('没有可执行的获客策略');
    const searchQueries = executionUnits.map((unit) => unit.query);

    if (!task.platformAccountId) {
      throw new Error('获客任务未绑定执行账号，请重新创建任务');
    }
    const account = await findProspectingAccount(
      db,
      organizationId,
      task.platform,
      task.platformAccountId
    );
    if (!account) {
      const bound = await db.platformAccount.findFirst({
        where: {
          id: task.platformAccountId,
          organizationId,
          platform: task.platform as never
        },
        select: { name: true, status: true }
      });
      throw new Error(
        bound
          ? `任务绑定的账号「${bound.name}」当前不可用（状态：${bound.status}），请重新绑定账号后再执行`
          : `任务绑定的账号已不存在，请重新创建获客任务`
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
    // Orgs that never configured exclusion words still get peer/supplier
    // phrases filtered out of prospecting results.
    const icpExcludedKeywords =
      icp.excludedKeywords.length > 0
        ? icp.excludedKeywords
        : DEFAULT_ICP_FOR_PROSPECTING.excludedKeywords;
    const excludedSignals = [
      ...new Set([
        ...icpExcludedKeywords,
        ...plan.intent.exclusions,
        ...enabledStrategies.flatMap((strategy) => strategy.negativeSignals)
      ])
    ];

    const existingCandidates = await db.prospectCandidate.findMany({
      where: { prospectingTaskId: task.id }
    });
    const existingByUserKey = new Map(
      existingCandidates.map((row) => [row.userKey, row])
    );
    // 数字 UID 老行经画像补采后有 secUid 主页；新批次若以 secUid 为 key，
    // 需要通过主页索引命中同一行，避免同账号分裂成两行。
    const existingBySecUid = new Map<
      string,
      (typeof existingCandidates)[number]
    >();
    for (const row of existingCandidates) {
      const secUid = secUidFromHomepage(row.userHomepage);
      if (secUid && !existingBySecUid.has(secUid)) {
        existingBySecUid.set(secUid, row);
      }
    }
    const findExistingCandidate = (prospect: AggregatedProspect) => {
      const byKey = existingByUserKey.get(prospect.userKey);
      if (byKey) return byKey;
      const secUid = secUidFromHomepage(prospect.userHomepage);
      return secUid ? existingBySecUid.get(secUid) : undefined;
    };
    const recentCandidates = await db.prospectCandidate.findMany({
      where: {
        organizationId,
        platform: task.platform,
        prospectingTaskId: { not: task.id },
        createdAt: {
          gte: new Date(
            Date.now() -
              PROSPECT_GUARD.candidateDedupeTtlDays * 24 * 60 * 60 * 1000
          )
        }
      },
      select: { userKey: true, userHomepage: true }
    });
    const previouslySeenUserKeys = new Set<string>();
    for (const candidate of recentCandidates) {
      previouslySeenUserKeys.add(candidate.userKey);
      const secUid = secUidFromHomepage(candidate.userHomepage);
      if (secUid) previouslySeenUserKeys.add(secUid);
    }
    const skippedDuplicateUserKeys = new Set<string>();
    const skipContentIds = collectedVideoIds(existingCandidates);
    if (!options.forceRecrawl) {
      const recentIds = await loadRecentCrawledVideoIds(
        db,
        organizationId,
        task.platform
      );
      for (const id of recentIds) skipContentIds.add(id);
    }

    const guard = await loadProspectGuard(db, organizationId, account.id);
    const plannedVideos = executionUnits.reduce(
      (total, unit) => total + unit.maxVideos,
      0
    );
    assertCrawlAllowed(guard, plannedVideos);
    const remainingVideos = Math.max(
      0,
      PROSPECT_GUARD.dailyVideoLimit - guard.videosCrawled
    );
    let quotaExhausted = false;

    await updateTaskProgress(db, task.id, organizationId, executionToken, {
      phase: 'starting',
      strategyTotal: enabledStrategies.length,
      updatedAt: new Date().toISOString()
    });

    const prospectsByUser = new Map<
      string,
      {
        prospect: AggregatedProspect;
        score: ProspectUserScoreResult;
        attributions: ProspectAttribution[];
      }
    >();

    let semanticLlmUnavailable = false;
    const searchEmptyReasons = new Set<string>();

    for (const unit of executionUnits) {
      const strategyIndex = enabledStrategies.findIndex(
        (strategy) => strategy.id === unit.strategy.id
      );
      await updateTaskProgress(
        db,
        task.id,
        organizationId,
        executionToken,
        {
          phase: 'crawling',
          currentStrategy: unit.strategy.title,
          strategyIndex: strategyIndex + 1,
          strategyTotal: enabledStrategies.length,
          updatedAt: new Date().toISOString()
        },
        { totalVideos, totalComments, totalCandidates }
      );

      const { videos, searchEmptyReason } = await crawlSearchQueryComments(
        {
          platform: task.platform,
          cookie,
          query: unit.query,
          topNVideos: Math.min(unit.maxVideos, remainingVideos),
          maxCommentsPerVideo: Math.min(
            task.maxCommentsPerVideo,
            PROSPECT_GUARD.maxCommentsPerVideo
          ),
          commentScrollRounds: task.commentScrollRounds,
          skipContentIds,
          profileKey: `${task.platform}-${account.id}`,
          claimVideoSlot: async () => {
            const ok = await claimVideoCrawl(db, organizationId, account.id);
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
              strategyIndex: strategyIndex + 1,
              strategyTotal: enabledStrategies.length,
              currentStrategy: unit.strategy.title,
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
      if (searchEmptyReason) searchEmptyReasons.add(searchEmptyReason);

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
          currentStrategy: unit.strategy.title,
          strategyIndex: strategyIndex + 1,
          strategyTotal: enabledStrategies.length,
          updatedAt: new Date().toISOString()
        },
        { totalVideos, totalComments, totalCandidates }
      );

      const filtered = filterPreviouslySeenProspects(
        aggregateProspectComments(videos, unit.query),
        previouslySeenUserKeys
      );
      for (const userKey of filtered.skippedUserKeys) {
        skippedDuplicateUserKeys.add(userKey);
      }
      const prospects = filtered.prospects;
      const semantic = await scoreProspectsSemantically(
        db,
        organizationId,
        prospects,
        task.requirement,
        plan.intent,
        searchQueries,
        icp.highIntentKeywords,
        async (batchIndex, batchTotal) => {
          await updateTaskProgress(
            db,
            task.id,
            organizationId,
            executionToken,
            {
              phase: 'scoring',
              currentStrategy: unit.strategy.title,
              strategyIndex: strategyIndex + 1,
              strategyTotal: enabledStrategies.length,
              scoringBatchIndex: batchIndex,
              scoringBatchTotal: batchTotal,
              updatedAt: new Date().toISOString()
            },
            { totalVideos, totalComments, totalCandidates }
          );
        }
      );
      const semanticScores = semantic.scores;
      if (semantic.llmUnavailable) semanticLlmUnavailable = true;

      for (const prospect of prospects) {
        const ruleScore = scoreProspectUser({
          contents: prospect.evidence.map((item) => item.content),
          keywords: [
            ...plan.intent.buyingSignals,
            ...plan.intent.painPoints,
            ...plan.intent.targetAudience.roles
          ],
          icpHighIntentKeywords: icp.highIntentKeywords,
          icpTargetRoles: icp.targetRoles,
          icpTargetIndustries: icp.targetIndustries,
          icpExcludedKeywords: excludedSignals,
          videoTitle: prospect.sourceVideoTitle ?? undefined,
          profileText: prospect.userNickname ?? undefined
        });
        const score = mergeSemanticScore(
          ruleScore,
          semanticScores.get(prospect.userKey)
        );

        if (!passesProspectThreshold(score, task.minRelevanceScore)) continue;

        const attribution: ProspectAttribution = {
          strategyId: unit.strategy.id,
          strategyType: unit.strategy.type,
          query: unit.query,
          evidenceIds: prospect.evidence.map(evidenceKey)
        };
        const existing = prospectsByUser.get(prospect.userKey);
        if (existing) {
          existing.prospect.evidence = mergeProspectEvidence(
            existing.prospect.evidence,
            prospect.evidence
          );
          existing.attributions.push(attribution);
          if (existing.score.relevanceScore < score.relevanceScore) {
            existing.score = score;
          }
          continue;
        }
        prospectsByUser.set(prospect.userKey, {
          prospect,
          score,
          attributions: [attribution]
        });
      }
    }

    await updateTaskProgress(
      db,
      task.id,
      organizationId,
      executionToken,
      {
        phase: 'saving',
        strategyTotal: enabledStrategies.length,
        updatedAt: new Date().toISOString()
      },
      { totalVideos, totalComments, totalCandidates }
    );

    for (const { prospect, score, attributions } of prospectsByUser.values()) {
      const existing = findExistingCandidate(prospect);
      const saved = await upsertProspectCandidate(db, {
        taskId: task.id,
        organizationId,
        platform: task.platform,
        prospect,
        score,
        attributions,
        existing
      });
      // 刷新快照：同账号可能在同一批次以不同 key 再次命中该行。
      if (saved) {
        existingByUserKey.set(saved.userKey, saved);
        const savedSecUid = secUidFromHomepage(saved.userHomepage);
        if (savedSecUid) existingBySecUid.set(savedSecUid, saved);
      }
    }

    // 双链路 key 分裂的残余（历史行、画像补采前后不一致）在落库后统一合并。
    await mergeDuplicateProspectCandidates(db, task.id);

    // totalVideos/totalComments stay as the TRUE crawl metrics accumulated
    // during the run. Recomputing them from saved candidates used to collapse
    // "已爬取评论数" into "入库潜客拥有的评论数" (143 → 1), contradicting the
    // progress UI and making the zero-result warning unreachable when comments
    // were crawled but nobody passed the threshold.
    totalCandidates = await db.prospectCandidate.count({
      where: { prospectingTaskId: task.id }
    });

    const warnings: string[] = [];
    if (quotaExhausted) {
      warnings.push('今日额度已用完，已保存当前结果，明天可增量执行');
    }
    if (semanticLlmUnavailable) {
      warnings.push(
        '语义评估未完成，本轮结果仅供复核。请检查 LLM 配置后重新执行'
      );
    }
    if (skippedDuplicateUserKeys.size > 0) {
      warnings.push(
        `已跳过 ${skippedDuplicateUserKeys.size} 个近 ${PROSPECT_GUARD.candidateDedupeTtlDays} 天重复潜客`
      );
    }
    const zeroResultWarning = buildZeroResultWarning({
      totalComments,
      totalCandidates,
      skippedDuplicates: skippedDuplicateUserKeys.size,
      searchEmptyReasons: [...searchEmptyReasons]
    });
    if (zeroResultWarning) warnings.push(zeroResultWarning);
    const warning = warnings.join('。') || undefined;

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
          strategyTotal: enabledStrategies.length,
          updatedAt: new Date().toISOString(),
          ...(warning ? { warning } : {}),
          ...(searchEmptyReasons.size > 0
            ? { searchEmptyReasons: [...searchEmptyReasons] }
            : {})
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
    attributions: ProspectAttribution[];
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
      attributions: unknown;
    };
  }
) {
  // 返回落库后的最新行：调用方用它刷新快照索引，避免同批次内
  // 两个不同 key 的潜客命中同一行时，第二次 upsert 基于陈旧快照
  // 覆盖第一次合并的 evidence。
  const { prospect, score, existing, attributions } = input;
  if (!existing) {
    return db.prospectCandidate.create({
      data: {
        prospectingTaskId: input.taskId,
        organizationId: input.organizationId,
        platform: input.platform as never,
        keyword: '',
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
        matchedKeywords: score.matchedKeywords as never,
        attributions: attributions as never,
        buyingStage: score.buyingStage,
        confidence: score.confidence,
        riskFlags: score.riskFlags as never
      }
    });
  }

  const evidence = mergeProspectEvidence(
    asProspectEvidenceList(existing.evidence),
    prospect.evidence
  );
  const keepExistingScore = existing.relevanceScore >= score.relevanceScore;
  const mergedAttributions = mergeProspectAttributions(
    asAttributions(existing.attributions),
    attributions
  );

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
        : (score.matchedKeywords as never),
      attributions: mergedAttributions as never,
      buyingStage: keepExistingScore ? undefined : score.buyingStage,
      confidence: keepExistingScore ? undefined : score.confidence,
      riskFlags: keepExistingScore ? undefined : (score.riskFlags as never)
    }
  });
  return db.prospectCandidate.findUnique({ where: { id: existing.id } });
}

function asAttributions(value: unknown): ProspectAttribution[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ProspectAttribution =>
      item != null &&
      typeof item === 'object' &&
      typeof (item as ProspectAttribution).strategyId === 'string' &&
      typeof (item as ProspectAttribution).query === 'string'
  );
}

type ProspectCandidateRow = {
  id: string;
  userKey: string;
  externalUserId: string | null;
  userNickname: string | null;
  userHomepage: string | null;
  avatarUrl: string | null;
  content: string;
  commentCount: number;
  evidence: unknown;
  sourceVideoTitle: string | null;
  sourceVideoUrl: string | null;
  sourceVideoAuthor: string | null;
  sourcePostId: string | null;
  relevanceScore: number;
  leadLevel: string;
  scoreSource: string;
  intent: string | null;
  summary: string | null;
  matchedKeywords: unknown;
  attributions: unknown;
  buyingStage: string | null;
  confidence: number | null;
  riskFlags: unknown;
  customerId: string | null;
  createdAt: Date;
};

function pickMergeSurvivor(rows: ProspectCandidateRow[]): ProspectCandidateRow {
  // 已转客户的行承载客户归属，必须保留；其次保留数字 UID 行
  //（转客户的 platformUserKey 引用数字 UID，是平台稳定标识）。
  const withCustomer = rows.find((row) => row.customerId);
  if (withCustomer) return withCustomer;
  const withNumericKey = rows.find((row) => /^\d+$/.test(row.userKey));
  if (withNumericKey) return withNumericKey;
  return [...rows].sort(
    (a, b) => b.relevanceScore - a.relevanceScore || a.createdAt.getTime() - b.createdAt.getTime()
  )[0];
}

/**
 * 合并同一任务内"同账号多行"的潜客：结构化链路以数字 UID 作 userKey、
 * DOM 兜底以 secUid 作 userKey，画像补采前两行可能各自入库。按主页
 * secUid 分组，evidence 并集、评分取最高行、customerId 保留，删除多余行。
 * 幂等，可重复执行。
 */
export async function mergeDuplicateProspectCandidates(
  db: DatabaseClient,
  taskId: string
): Promise<{ groupsMerged: number; removedRows: number }> {
  const rows = (await db.prospectCandidate.findMany({
    where: { prospectingTaskId: taskId }
  })) as ProspectCandidateRow[];

  const bySecUid = new Map<string, ProspectCandidateRow[]>();
  for (const row of rows) {
    const secUid = secUidFromHomepage(row.userHomepage);
    if (!secUid) continue;
    const group = bySecUid.get(secUid) ?? [];
    group.push(row);
    bySecUid.set(secUid, group);
  }

  let groupsMerged = 0;
  let removedRows = 0;
  for (const group of bySecUid.values()) {
    if (group.length < 2) continue;
    // 同组内出现多个不同客户归属时合并会丢掉其中一个关联，
    // 属异常数据（同账号被转成两个客户），跳过合并保留原状。
    const distinctCustomerIds = new Set(
      group.filter((row) => row.customerId).map((row) => row.customerId)
    );
    if (distinctCustomerIds.size > 1) continue;
    groupsMerged++;
    const survivor = pickMergeSurvivor(group);
    const losers = group.filter((row) => row.id !== survivor.id);
    const best = [...group].sort(
      (a, b) => b.relevanceScore - a.relevanceScore
    )[0];
    const evidence = losers.reduce(
      (acc, row) => mergeProspectEvidence(acc, asProspectEvidenceList(row.evidence)),
      asProspectEvidenceList(survivor.evidence)
    );
    const attributions = losers.reduce(
      (acc, row) => mergeProspectAttributions(acc, asAttributions(row.attributions)),
      asAttributions(survivor.attributions)
    );

    await db.$transaction(async (tx) => {
      await tx.prospectCandidate.update({
        where: { id: survivor.id },
        data: {
          externalUserId:
            survivor.externalUserId ?? losers.find((l) => l.externalUserId)?.externalUserId ?? null,
          userNickname:
            survivor.userNickname ?? losers.find((l) => l.userNickname)?.userNickname ?? null,
          userHomepage:
            survivor.userHomepage ?? losers.find((l) => l.userHomepage)?.userHomepage ?? null,
          avatarUrl:
            survivor.avatarUrl ?? losers.find((l) => l.avatarUrl)?.avatarUrl ?? null,
          customerId:
            survivor.customerId ?? losers.find((l) => l.customerId)?.customerId ?? null,
          // 评分四件套整体取最高分行，content 同步其代表评论
          content: best.content,
          relevanceScore: best.relevanceScore,
          leadLevel: best.leadLevel,
          scoreSource: best.scoreSource,
          intent: best.intent,
          summary: best.summary,
          matchedKeywords: best.matchedKeywords as never,
          attributions: attributions as never,
          buyingStage: best.buyingStage,
          confidence: best.confidence,
          riskFlags: best.riskFlags as never,
          commentCount: evidence.length,
          evidence: evidence as never,
          createdAt: new Date(
            Math.min(...group.map((row) => row.createdAt.getTime()))
          )
        }
      });
      await tx.prospectCandidate.deleteMany({
        where: { id: { in: losers.map((row) => row.id) } }
      });
    });
    removedRows += losers.length;
  }

  return { groupsMerged, removedRows };
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

/**
 * 画像增强账号解析：优先复用产生该潜客的任务所绑定的账号；
 * 没有任务绑定的潜客（如外部导入）退回该平台最老的活跃账号。
 * 入队时把结果快照到 metadata.enrichAccountId，执行期不再重新选择。
 */
async function resolveEnrichAccountId(
  db: DatabaseClient,
  organizationId: string,
  candidate: { platform: string; prospectingTaskId: string | null }
): Promise<string | null> {
  if (candidate.prospectingTaskId) {
    const task = await db.prospectingTask.findFirst({
      where: { id: candidate.prospectingTaskId, organizationId },
      select: { platformAccountId: true }
    });
    if (task?.platformAccountId) return task.platformAccountId;
  }
  const fallback = await db.platformAccount.findFirst({
    where: {
      organizationId,
      platform: candidate.platform as never,
      mode: 'browser_assist',
      status: 'active',
      deletedAt: null,
      cookieRef: { not: '' }
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true }
  });
  return fallback?.id ?? null;
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
  const enrichAccountId = await resolveEnrichAccountId(
    db,
    organizationId,
    candidate
  );
  if (!enrichAccountId) {
    throw new Error(
      `未找到 ${candidate.platform} 平台的可用账号，请先在集成配置中扫码登录`
    );
  }
  await db.prospectCandidate.update({
    where: { id: candidate.id },
    data: {
      metadata: {
        ...asRecord(candidate.metadata),
        enrichStatus: 'queued',
        enrichError: null,
        enrichQueuedAt: new Date().toISOString(),
        enrichAccountId
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
  _userId: string
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

  const queuedAccountId = asRecord(candidate.metadata).enrichAccountId;
  const boundAccountId =
    typeof queuedAccountId === 'string' && queuedAccountId
      ? queuedAccountId
      : await resolveEnrichAccountId(db, organizationId, candidate);
  if (!boundAccountId) {
    throw new Error(
      `未找到 ${candidate.platform} 平台的可用账号，请先在集成配置中扫码登录`
    );
  }
  const account = await findProspectingAccount(
    db,
    organizationId,
    candidate.platform,
    boundAccountId
  );
  if (!account) {
    throw new Error(
      '绑定的采集账号已失效（可能已下线或 Cookie 过期），请重新发起画像增强'
    );
  }
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
    assertProfileAllowed(
      await loadProspectGuard(db, organizationId, account.id)
    );
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

  const preCandidate = await db.prospectCandidate.findFirst({
    where: { id: candidateId, organizationId },
    select: { platform: true, leadLevel: true }
  });
  const assignment = preCandidate
    ? await applyAssignmentRules(
        db,
        organizationId,
        { channel: preCandidate.platform, level: preCandidate.leadLevel },
        'customer'
      ).catch(() => null)
    : null;

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

    const existingByUser = await findCustomerByAcquisitionIdentity(
      tx,
      organizationId,
      {
        platform: candidate.platform,
        externalUserId: candidate.externalUserId,
        userKey: candidate.userKey
      }
    );

    if (!existingByUser) {
      // Phone collisions are exact; same-channel same-display-name customers
      // are usually the same person re-crawled under a different platform id
      // (e.g. two candidate rows both nicknamed "滚筒洗衣机") — surface them
      // in the same confirmation flow instead of silently creating doubles.
      const displayName =
        input.displayName?.trim() || candidate.userNickname || '潜客';
      const duplicateConditions: Array<Record<string, unknown>> = [];
      if (normalizedPhone) duplicateConditions.push({ phone: normalizedPhone });
      if (displayName !== '潜客') {
        duplicateConditions.push({
          displayName,
          channel: (channelMap[candidate.platform] ?? 'other') as never
        });
      }
      const duplicates =
        duplicateConditions.length > 0
          ? await tx.customer.findMany({
              where: {
                organizationId,
                deletedAt: null,
                OR: duplicateConditions as never
              }
            })
          : [];
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
        const source = item.sourceVideoTitle
          ? `（${item.sourceVideoTitle}）`
          : '';
        return `${index + 1}. ${item.content}${source}`;
      })
      .join('\n');
    const profile = asRecord(asRecord(candidate.metadata).profile);
    const profileNote = [
      typeof profile.signature === 'string'
        ? `简介：${profile.signature}`
        : null,
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
          assignedTo: assignment?.assigneeId ?? undefined,
          company: input.company?.trim() || '待补充',
          role: input.role?.trim() || '待补充',
          intent:
            input.intent?.trim() ||
            candidate.summary ||
            candidate.content.slice(0, 500) ||
            '来自关键词获客',
          nextAction: '首次联系',
          nextActionAt: defaultNextActionAt(candidate.leadLevel),
          channel: (channelMap[candidate.platform] ?? 'other') as never,
          sourceNote: [
            `关键词获客：${candidate.keyword}`,
            candidate.userHomepage ? `主页：${candidate.userHomepage}` : null,
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
            ...(candidate.externalUserId
              ? {
                  platformUserKey: `${candidate.platform}:${candidate.externalUserId}`
                }
              : {}),
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
      const meta = asRecord(customer.metadata);
      const platformUserKey = candidate.externalUserId
        ? `${candidate.platform}:${candidate.externalUserId}`
        : undefined;
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          metadata: {
            ...meta,
            prospectCandidateId: candidate.id,
            prospectingTaskId: candidate.prospectingTaskId,
            prospectUserKey: candidate.userKey,
            ...(platformUserKey ? { platformUserKey } : {}),
            leadLevel: candidate.leadLevel
          } as never
        }
      });
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
