import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { decryptToken } from '@ai-growth-ops/providers';
import {
  compileProspectingPlan,
  clearCaptchaBlock,
  findProspectingAccount,
  listProspectingAccounts,
  loadProspectGuard,
  resolveLlmClientFromDb,
  type DatabaseClient
} from '@ai-growth-ops/database';
import {
  emptyProspectGuardState,
  isProspectingTaskRunnable,
  planCrawlQuota,
  PROSPECT_GUARD,
  prospectingPlanSchema,
  remainingMs,
  scoreAccountHealth
} from '@ai-growth-ops/shared';
import {
  getBrowserRunnerUrl,
  fetchWithTimeout,
  runnerHeaders
} from './browser-login-config.js';
import {
  clearCaptchaSolveSession,
  getCaptchaSolveSession,
  setCaptchaSolveSession
} from './captcha-solve-session.js';
import { getOrganizationContext } from './auth.js';
import { parsePagination } from './middleware/pagination.js';
import { validateBody } from './middleware/validate.js';
import { hasPermission } from './middleware/rbac.js';
import {
  runProspectingTaskSchema,
  analyzeProspectingPlanSchema,
  convertProspectSchema,
  createProspectingTaskSchema
} from './schemas/prospecting.js';
import {
  convertProspectToCustomer,
  enqueueProspectingEnrich,
  enqueueProspectingRun
} from './services/prospecting.js';
import { enqueueCustomerProfileRefresh } from './services/customer-profile.js';
import { trySyncCustomerToFeishu } from '@ai-growth-ops/database';

interface RouteContext {
  db: DatabaseClient;
  url: URL;
  params: Record<string, string>;
  body: unknown;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

async function buildGuardPayload(
  db: DatabaseClient,
  organizationId: string,
  platform: string,
  platformAccountId?: string
) {
  // 未指定账号时不再自动回退到最老账号：返回 needsLogin 引导先选账号
  const account = platformAccountId
    ? await findProspectingAccount(db, organizationId, platform, platformAccountId)
    : null;
  const state = account
    ? await loadProspectGuard(db, organizationId, account.id)
    : emptyProspectGuardState();
  const videosRemaining = Math.max(
    0,
    PROSPECT_GUARD.dailyVideoLimit - state.videosCrawled
  );
  const profilesRemaining = Math.max(
    0,
    PROSPECT_GUARD.dailyProfileLimit - state.profilesFetched
  );
  return {
    ...state,
    needsLogin: !account,
    platformAccountId: account?.id ?? null,
    platformAccountName: account?.name ?? null,
    videosRemaining,
    profilesRemaining,
    captchaWaitMs: remainingMs(state.captchaBlockedUntil),
    estimatedMinutesRemaining: planCrawlQuota(videosRemaining, videosRemaining)
      .estimatedMinutes,
    skipTtlDays: PROSPECT_GUARD.videoSkipTtlDays,
    health: scoreAccountHealth({
      needsLogin: !account,
      captchaWaitMs: remainingMs(state.captchaBlockedUntil),
      videosRemaining,
      captchaHitsToday: state.captchaHits
    }),
    limits: PROSPECT_GUARD
  };
}

export const prospectingRoutes: Array<{
  method: string;
  pattern: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: RouteContext
  ) => Promise<void>;
}> = [
  {
    method: 'POST',
    pattern: '/api/prospecting/plan',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'research:create')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const bodyResult = validateBody(analyzeProspectingPlanSchema, ctx.body);
      if (!bodyResult.success) {
        return sendJson(res, 400, {
          error: '请输入完整的获客需求',
          errors: bodyResult.errors
        });
      }

      const llmClient = await resolveLlmClientFromDb(
        ctx.db,
        orgCtx.organization.id
      ).catch(() => undefined);
      if (!llmClient) {
        return sendJson(res, 409, {
          error: '请先在「集成 → LLM」配置 AI 服务后再分析需求'
        });
      }
      const platform = bodyResult.data.platform ?? 'douyin';
      const account = await findProspectingAccount(
        ctx.db,
        orgCtx.organization.id,
        platform,
        bodyResult.data.platformAccountId
      );
      if (!account) {
        return sendJson(res, 409, {
          error: '所选抖音账号不可用，请重新选择或扫码登录'
        });
      }
      const guard = await buildGuardPayload(
        ctx.db,
        orgCtx.organization.id,
        platform,
        account.id
      );
      try {
        const plan = await compileProspectingPlan({
          requirement: bodyResult.data.requirement,
          availableVideos: guard.videosRemaining,
          llmClient
        });
        const draft = await ctx.db.prospectingPlanDraft.create({
          data: {
            organizationId: orgCtx.organization.id,
            userId: orgCtx.user.id,
            platform,
            platformAccountId: account.id,
            requirement: plan.requirement,
            intent: plan.intent as never,
            strategyPlan: plan as never,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
          }
        });
        sendJson(res, 200, {
          planId: draft.id,
          plan,
          guard: {
            videosRemaining: guard.videosRemaining,
            estimatedMinutes: planCrawlQuota(
              plan.limits.maxTotalVideos,
              guard.videosRemaining
            ).estimatedMinutes
          }
        });
      } catch (error) {
        sendJson(res, 422, {
          error: error instanceof Error ? error.message : '需求分析失败，请重试'
        });
      }
    }
  },
  {
    method: 'GET',
    pattern: '/api/prospecting/accounts',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'research:view')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const platform = ctx.url.searchParams.get('platform') || 'douyin';
      const accounts = await listProspectingAccounts(
        ctx.db,
        orgCtx.organization.id,
        platform
      );
      sendJson(
        res,
        200,
        await Promise.all(
          accounts.map((account) =>
            buildGuardPayload(
              ctx.db,
              orgCtx.organization.id,
              platform,
              account.id
            )
          )
        )
      );
    }
  },
  {
    method: 'GET',
    pattern: '/api/prospecting/guard',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'research:view')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const platform = ctx.url.searchParams.get('platform') || 'douyin';
      const platformAccountId = ctx.url.searchParams.get('platformAccountId');
      const payload = await buildGuardPayload(
        ctx.db,
        orgCtx.organization.id,
        platform,
        platformAccountId || undefined
      );
      sendJson(res, 200, payload);
    }
  },
  {
    method: 'POST',
    pattern: '/api/prospecting/captcha/start',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'research:create')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const platform = ctx.url.searchParams.get('platform') || 'douyin';
      const platformAccountId = ctx.url.searchParams.get('platformAccountId');
      if (!platformAccountId) {
        return sendJson(res, 400, { error: '请先选择执行账号' });
      }
      const account = await findProspectingAccount(
        ctx.db,
        orgCtx.organization.id,
        platform,
        platformAccountId
      );
      if (!account) {
        return sendJson(res, 400, {
          error: '所选账号不可用，请重新选择或扫码登录'
        });
      }
      const existing = getCaptchaSolveSession(orgCtx.organization.id);
      if (existing) {
        try {
          await fetchWithTimeout(
            `${getBrowserRunnerUrl()}/assist/captcha-session/${existing.sessionId}/cancel`,
            { method: 'POST', headers: runnerHeaders() },
            5_000
          );
        } catch {
          /* best-effort */
        }
        clearCaptchaSolveSession(orgCtx.organization.id);
      }
      try {
        const startRes = await fetchWithTimeout(
          `${getBrowserRunnerUrl()}/assist/captcha-session/start`,
          {
            method: 'POST',
            headers: runnerHeaders({ 'content-type': 'application/json' }),
            body: JSON.stringify({
              cookie: decryptToken(account.cookieRef),
              platform: account.platform
            })
          },
          20_000
        );
        if (!startRes.ok) {
          const err = (await startRes.json().catch(() => ({}))) as {
            error?: string;
          };
          return sendJson(res, 502, {
            error: err.error || '无法打开过码窗口，请确认浏览器助手已启动'
          });
        }
        const data = (await startRes.json()) as { sessionId: string };
        setCaptchaSolveSession(
          orgCtx.organization.id,
          account.id,
          data.sessionId
        );
        sendJson(res, 200, { sessionId: data.sessionId, status: 'waiting' });
      } catch {
        sendJson(res, 502, {
          error: '浏览器助手不可用，请确认服务已启动，或改用「我已完成验证」'
        });
      }
    }
  },
  {
    method: 'GET',
    pattern: '/api/prospecting/captcha/status',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const session = getCaptchaSolveSession(orgCtx.organization.id);
      if (!session) {
        return sendJson(res, 200, {
          status: 'expired',
          error: '没有进行中的过码会话'
        });
      }
      try {
        const statusRes = await fetchWithTimeout(
          `${getBrowserRunnerUrl()}/assist/captcha-session/${session.sessionId}/status`,
          { method: 'GET', headers: runnerHeaders() },
          10_000
        );
        const data = (await statusRes.json().catch(() => ({}))) as {
          status?: 'waiting' | 'solved' | 'expired';
          error?: string;
        };
        if (data.status === 'solved') {
          await clearCaptchaBlock(
            ctx.db,
            orgCtx.organization.id,
            session.platformAccountId
          );
          clearCaptchaSolveSession(orgCtx.organization.id);
        } else if (data.status === 'expired') {
          clearCaptchaSolveSession(orgCtx.organization.id);
        }
        sendJson(res, 200, {
          status: data.status ?? 'expired',
          error: data.error
        });
      } catch {
        sendJson(res, 200, {
          status: 'expired',
          error: '浏览器助手无响应'
        });
      }
    }
  },
  {
    method: 'POST',
    pattern: '/api/prospecting/captcha/cancel',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const session = getCaptchaSolveSession(orgCtx.organization.id);
      if (session) {
        try {
          await fetchWithTimeout(
            `${getBrowserRunnerUrl()}/assist/captcha-session/${session.sessionId}/cancel`,
            { method: 'POST', headers: runnerHeaders() },
            5_000
          );
        } catch {
          /* best-effort */
        }
        clearCaptchaSolveSession(orgCtx.organization.id);
      }
      sendJson(res, 200, { ok: true });
    }
  },
  {
    method: 'POST',
    pattern: '/api/prospecting/captcha/resolved',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'research:create')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const platform = ctx.url.searchParams.get('platform') || 'douyin';
      const platformAccountId = ctx.url.searchParams.get('platformAccountId');
      if (!platformAccountId) {
        return sendJson(res, 400, { error: '请先选择执行账号' });
      }
      const account = await findProspectingAccount(
        ctx.db,
        orgCtx.organization.id,
        platform,
        platformAccountId
      );
      if (!account) {
        return sendJson(res, 400, { error: '所选账号不可用，请重新选择或扫码登录' });
      }
      const session = getCaptchaSolveSession(orgCtx.organization.id);
      if (session) {
        try {
          await fetchWithTimeout(
            `${getBrowserRunnerUrl()}/assist/captcha-session/${session.sessionId}/cancel`,
            { method: 'POST', headers: runnerHeaders() },
            5_000
          );
        } catch {
          /* best-effort */
        }
        clearCaptchaSolveSession(orgCtx.organization.id);
      }
      await clearCaptchaBlock(ctx.db, orgCtx.organization.id, account.id);
      sendJson(res, 200, { ok: true });
    }
  },
  {
    method: 'GET',
    pattern: '/api/prospecting/tasks',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'research:view')) {
        return sendJson(res, 403, { error: '权限不足' });
      }

      const { page, pageSize } = parsePagination(ctx.url);
      const where = { organizationId: orgCtx.organization.id };
      const [items, total] = await Promise.all([
        ctx.db.prospectingTask.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize
        }),
        ctx.db.prospectingTask.count({ where })
      ]);

      sendJson(res, 200, {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      });
    }
  },
  {
    method: 'POST',
    pattern: '/api/prospecting/tasks',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'research:create')) {
        return sendJson(res, 403, { error: '权限不足' });
      }

      const bodyResult = validateBody(createProspectingTaskSchema, ctx.body);
      if (!bodyResult.success) {
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      }

      const enabledStrategyIds = new Set(bodyResult.data.enabledStrategyIds);
      if (
        enabledStrategyIds.size !== bodyResult.data.enabledStrategyIds.length
      ) {
        return sendJson(res, 400, { error: '策略选择不能重复' });
      }
      const draft = await ctx.db.prospectingPlanDraft.findFirst({
        where: {
          id: bodyResult.data.planId,
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id,
          consumedAt: null,
          expiresAt: { gt: new Date() }
        }
      });
      if (!draft) {
        return sendJson(res, 404, { error: '需求分析已失效，请重新分析' });
      }
      const parsedPlan = prospectingPlanSchema.safeParse(draft.strategyPlan);
      if (!parsedPlan.success) {
        return sendJson(res, 409, { error: '需求分析计划已损坏，请重新分析' });
      }
      const availableIds = new Set(
        parsedPlan.data.strategies.map((strategy) => strategy.id)
      );
      if ([...enabledStrategyIds].some((id) => !availableIds.has(id))) {
        return sendJson(res, 400, { error: '包含无效的获客策略' });
      }
      const plan = prospectingPlanSchema.parse({
        ...parsedPlan.data,
        strategies: parsedPlan.data.strategies.map((strategy) => ({
          ...strategy,
          enabled: enabledStrategyIds.has(strategy.id)
        }))
      });

      const task = await ctx.db.$transaction(async (tx) => {
        const consumed = await tx.prospectingPlanDraft.updateMany({
          where: { id: draft.id, consumedAt: null },
          data: { consumedAt: new Date() }
        });
        if (consumed.count !== 1) throw new Error('需求分析已被使用');
        return tx.prospectingTask.create({
          data: {
            organizationId: orgCtx.organization.id,
            userId: orgCtx.user.id,
            platform: draft.platform,
            platformAccountId: draft.platformAccountId,
            keywords: [],
            requirement: plan.requirement,
            intent: plan.intent as never,
            strategyPlan: plan as never,
            planVersion: plan.version,
            topNVideos: 1,
            maxCommentsPerVideo: plan.limits.maxCommentsPerVideo,
            commentScrollRounds: 8,
            minRelevanceScore: bodyResult.data.minRelevanceScore,
            status: 'draft'
          }
        });
      });

      sendJson(res, 201, task);
    }
  },
  {
    method: 'GET',
    pattern: '/api/prospecting/tasks/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'research:view')) {
        return sendJson(res, 403, { error: '权限不足' });
      }

      const minScore = Number(ctx.url.searchParams.get('minScore') ?? '0');
      const task = await ctx.db.prospectingTask.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id
        },
        include: {
          candidates: {
            where:
              minScore > 0 ? { relevanceScore: { gte: minScore } } : undefined,
            orderBy: { relevanceScore: 'desc' }
          }
        }
      });

      if (!task) return sendJson(res, 404, { error: '任务不存在' });
      sendJson(res, 200, task);
    }
  },
  {
    method: 'GET',
    pattern: '/api/prospecting/tasks/:id/export.csv',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'research:view')) {
        return sendJson(res, 403, { error: '权限不足' });
      }

      const task = await ctx.db.prospectingTask.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id
        },
        select: { id: true }
      });
      if (!task) return sendJson(res, 404, { error: '任务不存在' });

      const minScore = Number(ctx.url.searchParams.get('minScore') ?? '0');
      const candidates = await ctx.db.prospectCandidate.findMany({
        where: {
          prospectingTaskId: task.id,
          ...(minScore > 0 ? { relevanceScore: { gte: minScore } } : {})
        },
        orderBy: { relevanceScore: 'desc' }
      });

      const { exportToCSV, PROSPECT_EXPORT_COLUMNS } =
        await import('./services/export-service.js');
      const csv = exportToCSV(
        candidates as unknown as Record<string, unknown>[],
        PROSPECT_EXPORT_COLUMNS
      );

      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="prospects-${task.id}.csv"`
      });
      res.end(csv);
    }
  },
  {
    method: 'POST',
    pattern: '/api/prospecting/tasks/:id/run',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'research:create')) {
        return sendJson(res, 403, { error: '权限不足' });
      }

      const bodyResult = validateBody(
        runProspectingTaskSchema,
        ctx.body && typeof ctx.body === 'object' ? ctx.body : {}
      );
      if (!bodyResult.success) {
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      }
      const forceRecrawl = Boolean(bodyResult.data.forceRecrawl);

      const task = await ctx.db.prospectingTask.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id
        },
        select: { id: true, status: true, platform: true, platformAccountId: true }
      });
      if (!task) return sendJson(res, 404, { error: '任务不存在' });
      if (!isProspectingTaskRunnable(task.status)) {
        return sendJson(res, 409, {
          error: `任务状态 ${task.status} 不可执行`
        });
      }

      // 额度/验证码检查必须针对任务绑定的账号，不能用其他账号的配额放行
      const guard = await buildGuardPayload(
        ctx.db,
        orgCtx.organization.id,
        task.platform,
        task.platformAccountId ?? undefined
      );
      if (guard.needsLogin) {
        return sendJson(res, 400, {
          error: task.platformAccountId
            ? '任务绑定的账号不可用（可能已下线或 Cookie 过期），请重新绑定后再执行'
            : `任务未绑定执行账号，请重新创建获客任务`
        });
      }
      if (guard.captchaWaitMs > 0) {
        return sendJson(res, 429, {
          error: `平台验证码冷却中，请 ${Math.ceil(guard.captchaWaitMs / 60000)} 分钟后再执行`
        });
      }
      if (guard.videosRemaining <= 0) {
        return sendJson(res, 429, {
          error: `今日爬取额度已用完（${PROSPECT_GUARD.dailyVideoLimit} 个视频/天），请明天增量执行`
        });
      }

      try {
        const executionToken = randomUUID();
        const claim = await ctx.db.prospectingTask.updateMany({
          where: {
            id: task.id,
            organizationId: orgCtx.organization.id,
            status: { in: ['draft', 'failed', 'completed'] }
          },
          data: {
            status: 'running',
            executionToken,
            startedAt: new Date(),
            finishedAt: null,
            lastError: null
          }
        });
        if (claim.count !== 1) {
          return sendJson(res, 409, { error: '任务已被其他请求执行' });
        }
        try {
          await enqueueProspectingRun(
            task.id,
            orgCtx.organization.id,
            orgCtx.user.id,
            executionToken,
            forceRecrawl
          );
        } catch (error) {
          await ctx.db.prospectingTask.updateMany({
            where: { id: task.id, executionToken },
            data: {
              status: 'failed',
              executionToken: null,
              finishedAt: new Date(),
              lastError: error instanceof Error ? error.message : '任务入队失败'
            }
          });
          throw error;
        }
        sendJson(res, 202, {
          queued: true,
          taskId: task.id,
          forceRecrawl,
          videosRemaining: guard.videosRemaining,
          estimatedMinutes: guard.estimatedMinutesRemaining
        });
      } catch (e) {
        sendJson(res, 400, { error: (e as Error).message });
      }
    }
  },
  {
    method: 'POST',
    pattern: '/api/prospecting/candidates/:id/convert',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'lead:edit')) {
        return sendJson(res, 403, { error: '权限不足' });
      }

      const bodyResult = validateBody(convertProspectSchema, ctx.body);
      if (!bodyResult.success) {
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      }

      try {
        const result = await convertProspectToCustomer(
          ctx.db,
          ctx.params.id,
          orgCtx.organization.id,
          orgCtx.user.id,
          bodyResult.data
        );
        sendJson(res, 201, result);
        enqueueCustomerProfileRefresh(
          result.customer.id,
          orgCtx.organization.id,
          orgCtx.user.id
        ).catch(() => undefined);
        trySyncCustomerToFeishu(
          ctx.db,
          result.customer.id,
          orgCtx.organization.id,
          orgCtx.user.name
        ).catch(() => undefined);
      } catch (e) {
        const err = e as Error & { code?: string; duplicates?: unknown[] };
        if (err.code === 'duplicate') {
          return sendJson(res, 409, {
            error: 'duplicate',
            message: '手机号已存在',
            duplicates: err.duplicates ?? []
          });
        }
        sendJson(res, 400, { error: err.message });
      }
    }
  },
  {
    method: 'POST',
    pattern: '/api/prospecting/candidates/:id/enrich',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'research:create')) {
        return sendJson(res, 403, { error: '权限不足' });
      }

      try {
        await enqueueProspectingEnrich(
          ctx.db,
          ctx.params.id,
          orgCtx.organization.id,
          orgCtx.user.id
        );
        sendJson(res, 202, { queued: true, candidateId: ctx.params.id });
      } catch (e) {
        sendJson(res, 400, { error: (e as Error).message });
      }
    }
  }
];
