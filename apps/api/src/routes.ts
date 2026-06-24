import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import Busboy from 'busboy';

import type { DatabaseClient } from '@ai-growth-ops/database';
import { createLogger } from '@ai-growth-ops/observability';
import {
  encryptToken,
  decryptToken,
  getPlatformProvider
} from '@ai-growth-ops/providers';
import { getSharedSkillRunner } from '@ai-growth-ops/skills';
import type { SkillRunResult } from '@ai-growth-ops/skills';
import { taskRoutes } from './routes-tasks.js';
import { notificationRoutes } from './routes-notifications.js';
import { auditRoutes } from './routes-audit.js';
import { analyticsRoutes } from './routes-analytics.js';
import { authRoutes } from './routes-auth.js';
import { orgRoutes } from './routes-org.js';
import { getCustomerDashboard } from './mvp-service';
import {
  applyPublishProgress,
  isPublishProgressAuthorized
} from './publish-progress.js';
import {
  getBrowserRunnerUrl,
  fetchWithTimeout,
  runnerHeaders
} from './browser-login-config';
import {
  setSession,
  getSessionId,
  clearSession,
  markPending,
  clearPending
} from './browser-login-session';
import {
  hashPassword,
  verifyPassword,
  createToken,
  getAuthenticatedUser,
  getOrganizationContext
} from './auth.js';
import { isLoginRateLimited, isRateLimited } from './server.js';
import { parsePagination, paginate } from './middleware/pagination.js';
import { validateBody } from './middleware/validate.js';
import { hasPermission, hasAnyPermission } from './middleware/rbac.js';
import { createResearchTaskSchema } from './schemas/research.js';
import {
  createContentItemSchema,
  updateContentItemSchema,
  updateContentVariantSchema,
  batchGenerateVariantsSchema
} from './schemas/content.js';
import {
  createPublishJobSchema,
  batchPublishSchema
} from './schemas/publish.js';
import { updateLeadSchema } from './schemas/leads.js';
import {
  createCampaignSchema,
  updateCampaignSchema
} from './schemas/campaign.js';
import {
  executeResearchTaskSync,
  ResearchExecutionError
} from './research-executor.js';
import { classifyByRules, generateRuleBasedReply } from './rule-classifier.js';

// ── AI Skill Runner ────────────────────────────────────────────────

async function runSkillSafely<T>(
  skillName: string,
  input: unknown
): Promise<SkillRunResult<T> | null> {
  try {
    const runner = getSharedSkillRunner();
    return await runner.run({ skillName, input: input as never });
  } catch {
    return null;
  }
}

type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext
) => Promise<void>;

interface RouteContext {
  db: DatabaseClient;
  url: URL;
  params: Record<string, string>;
  body: unknown;
  files: UploadedFile[];
}

interface Route {
  method: string;
  pattern: string;
  handler: RouteHandler;
}

const routeLogger = createLogger('api');

const routes: Route[] = [
  // ── Health ──────────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/health',
    handler: async (_req, res, ctx) => {
      const checks: Record<
        string,
        { status: string; latencyMs?: number; error?: string }
      > = {};
      let overall: 'ok' | 'degraded' | 'unhealthy' = 'ok';

      // Check database
      try {
        const start = Date.now();
        await ctx.db.$queryRaw`SELECT 1`;
        checks.database = { status: 'ok', latencyMs: Date.now() - start };
      } catch (err) {
        checks.database = {
          status: 'error',
          error: err instanceof Error ? err.message : String(err)
        };
        overall = 'unhealthy';
      }

      // Check Redis
      try {
        const { default: Redis } = await import('ioredis');
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        const start = Date.now();
        const redis = new Redis(redisUrl, {
          lazyConnect: true,
          connectTimeout: 3000
        });
        await redis.connect();
        await redis.ping();
        checks.redis = { status: 'ok', latencyMs: Date.now() - start };
        redis.disconnect();
      } catch (err) {
        checks.redis = {
          status: 'error',
          error: err instanceof Error ? err.message : String(err)
        };
        overall = overall === 'unhealthy' ? 'unhealthy' : 'degraded';
      }

      // Check browser-runner
      try {
        const runnerUrl = getBrowserRunnerUrl();
        const start = Date.now();
        const resp = await fetchWithTimeout(
          `${runnerUrl}/health`,
          { method: 'GET' },
          3_000
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        checks.browserRunner = { status: 'ok', latencyMs: Date.now() - start };
      } catch (err) {
        checks.browserRunner = {
          status: 'error',
          error: err instanceof Error ? err.message : String(err)
        };
        overall = overall === 'unhealthy' ? 'unhealthy' : 'degraded';
      }

      const statusCode =
        overall === 'ok' ? 200 : overall === 'degraded' ? 200 : 503;
      sendJson(res, statusCode, {
        name: 'api',
        status: overall,
        version: process.env.APP_VERSION || 'dev',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        checks
      });
    }
  },

  // ── Auth ──────────────────────────────────────────────────────
  {
    method: 'POST',
    pattern: '/api/auth/login',
    handler: async (req, res, ctx) => {
      // Rate limit login attempts
      const clientIp = req.socket.remoteAddress ?? 'unknown';
      if (isLoginRateLimited(clientIp)) {
        return sendJson(res, 429, { error: '登录尝试过于频繁，请稍后再试' });
      }
      const body = ctx.body as Record<string, unknown>;
      const email = String(body.email ?? '');
      const password = String(body.password ?? '');
      if (!email || !password)
        return sendJson(res, 400, { error: '邮箱和密码不能为空' });
      const user = await ctx.db.user.findFirst({
        where: { email, deletedAt: null }
      });
      if (!user) return sendJson(res, 401, { error: '邮箱或密码错误' });
      if (!user.passwordHash || !verifyPassword(password, user.passwordHash)) {
        return sendJson(res, 401, { error: '邮箱或密码错误' });
      }
      const token = createToken(user.id);
      // Fetch user's organizations for frontend context
      const memberships = await ctx.db.organizationMember.findMany({
        where: { userId: user.id, status: 'active' },
        include: {
          organization: { select: { id: true, name: true, slug: true } }
        },
        orderBy: { joinedAt: 'asc' }
      });
      const organizations = memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role
      }));
      sendJson(res, 200, {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        organizations
      });
    }
  },
  {
    method: 'GET',
    pattern: '/api/auth/me',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      // Also return organizations for context
      const memberships = await ctx.db.organizationMember.findMany({
        where: { userId: orgCtx.user.id, status: 'active' },
        include: {
          organization: { select: { id: true, name: true, slug: true } }
        },
        orderBy: { joinedAt: 'asc' }
      });
      const organizations = memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role
      }));
      sendJson(res, 200, {
        id: orgCtx.user.id,
        name: orgCtx.user.name,
        email: orgCtx.user.email,
        role: orgCtx.user.role,
        emailVerifiedAt: orgCtx.user.emailVerifiedAt,
        avatarUrl: orgCtx.user.avatarUrl,
        organizations
      });
    }
  },

  // ── Dashboard ──────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/dashboard',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      sendJson(res, 200, await getCustomerDashboard(ctx.db, orgCtx.user.id));
    }
  },

  // ── Research Tasks ─────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/research-tasks',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const { page, pageSize } = parsePagination(ctx.url);
      const result = await paginate(
        ctx.db.researchTask,
        { organizationId: orgCtx.organization.id, deletedAt: null },
        { page, pageSize },
        { createdAt: 'desc' },
        { insights: true, opportunities: true }
      );
      sendJson(res, 200, result);
    }
  },
  {
    method: 'GET',
    pattern: '/api/research-tasks/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const item = await ctx.db.researchTask.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        },
        include: {
          researchKeywords: true,
          targetAccounts: true,
          collectedPosts: true,
          collectedComments: true,
          insights: true,
          opportunities: true
        }
      });
      if (!item) return sendJson(res, 404, { error: 'Not found' });
      sendJson(res, 200, item);
    }
  },
  {
    method: 'POST',
    pattern: '/api/research-tasks',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const bodyResult = validateBody(createResearchTaskSchema, ctx.body);
      if (!bodyResult.success)
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      const body = bodyResult.data as Record<string, unknown>;
      const item = await ctx.db.researchTask.create({
        data: {
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id,
          type: String(body.type ?? 'keyword_search'),
          platforms: (body.platforms as string[]) ?? [],
          keywords: (body.keywords as string[]) ?? [],
          status: 'DRAFT'
        }
      });
      sendJson(res, 201, item);
    }
  },
  {
    method: 'POST',
    pattern: '/api/research-tasks/:id/run',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (isRateLimited(`research:${orgCtx.organization.id}`, 5, 60_000))
        return sendJson(res, 429, { error: '调研操作过于频繁，请稍后再试' });
      try {
        const result = await executeResearchTaskSync(
          ctx.db,
          ctx.params.id,
          orgCtx.user.id
        );
        sendJson(res, 200, {
          task: result.task,
          posts: result.posts,
          comments: result.comments,
          insights: result.insights,
          opportunities: result.opportunities
        });
      } catch (err) {
        if (err instanceof ResearchExecutionError) {
          return sendJson(res, err.status, {
            error: { code: err.code, message: err.message }
          });
        }
        throw err;
      }
    }
  },
  {
    method: 'POST',
    pattern: '/api/research-tasks/:id/pause',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const task = await ctx.db.researchTask.findFirst({
        where: { id: ctx.params.id, organizationId: orgCtx.organization.id }
      });
      if (!task) return sendJson(res, 404, { error: 'Not found' });
      if (!['RUNNING', 'QUEUED'].includes(task.status)) {
        return sendJson(res, 400, {
          error: {
            code: 'INVALID_STATE',
            message: `Cannot pause from ${task.status} state`
          }
        });
      }
      const item = await ctx.db.researchTask.update({
        where: { id: ctx.params.id },
        data: { status: 'PAUSED' }
      });
      sendJson(res, 200, item);
    }
  },

  // ── Research Collected Posts ───────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/research-tasks/:taskId/posts',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const task = await ctx.db.researchTask.findFirst({
        where: { id: ctx.params.taskId, organizationId: orgCtx.organization.id }
      });
      if (!task) return sendJson(res, 404, { error: 'Not found' });
      const items = await ctx.db.collectedPost.findMany({
        where: { researchTaskId: ctx.params.taskId },
        orderBy: { collectedAt: 'desc' }
      });
      sendJson(res, 200, items);
    }
  },
  {
    method: 'GET',
    pattern: '/api/research-tasks/:taskId/comments',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const task = await ctx.db.researchTask.findFirst({
        where: { id: ctx.params.taskId, organizationId: orgCtx.organization.id }
      });
      if (!task) return sendJson(res, 404, { error: 'Not found' });
      const items = await ctx.db.collectedComment.findMany({
        where: { researchTaskId: ctx.params.taskId },
        orderBy: { collectedAt: 'desc' }
      });
      sendJson(res, 200, items);
    }
  },

  // ── Research Insights ──────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/research-insights',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const items = await ctx.db.researchInsight.findMany({
        where: { researchTask: { organizationId: orgCtx.organization.id } },
        orderBy: { createdAt: 'desc' }
      });
      sendJson(res, 200, items);
    }
  },

  // ── Content Opportunities ──────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/content-opportunities',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const items = await ctx.db.contentOpportunity.findMany({
        where: { researchTask: { organizationId: orgCtx.organization.id } },
        orderBy: { createdAt: 'desc' }
      });
      sendJson(res, 200, items);
    }
  },
  {
    method: 'POST',
    pattern: '/api/content-opportunities/:id/create-content',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const opp = await ctx.db.contentOpportunity.findFirst({
        where: {
          id: ctx.params.id,
          researchTask: { organizationId: orgCtx.organization.id }
        },
        include: { researchTask: { select: { keywords: true } } }
      });
      if (!opp) return sendJson(res, 404, { error: 'Not found' });

      // Use AI to generate content from the opportunity (reuse content-writing skill)
      try {
        const { generateContentWithMedia } =
          await import('./services/content-media-generation.js');
        const researchKeywords = Array.isArray(
          (opp.researchTask as Record<string, unknown>)?.keywords
        )
          ? ((opp.researchTask as Record<string, unknown>).keywords as string[])
          : [opp.title];
        const result = await generateContentWithMedia(ctx.db, {
          topic: opp.title,
          contentType: 'text_image',
          keywords: researchKeywords,
          brandTone: '专业、友好',
          orgId: orgCtx.organization.id,
          userId: orgCtx.user.id
        });

        // Mark as sourced from opportunity
        await ctx.db.contentItem.update({
          where: { id: result.contentItem.id },
          data: {
            sourceType: 'opportunity',
            sourceResearchTaskId: opp.researchTaskId
          }
        });

        sendJson(res, 201, {
          contentItemId: result.contentItem.id,
          generated: true
        });
      } catch (err) {
        // Fallback: create empty draft
        console.error(
          '[research] AI content generation failed, creating empty draft:',
          err
        );
        const projectId = await getOrCreateDefaultProject(
          ctx.db,
          orgCtx.user.id,
          orgCtx.organization.id
        );
        const item = await ctx.db.contentItem.create({
          data: {
            organizationId: orgCtx.organization.id,
            userId: orgCtx.user.id,
            projectId,
            type: 'text_image',
            title: opp.title,
            body: opp.description ?? '',
            status: 'draft',
            sourceType: 'opportunity',
            sourceResearchTaskId: opp.researchTaskId
          }
        });
        sendJson(res, 201, { contentItemId: item.id, generated: false });
      }
    }
  },

  // ── Campaigns ──────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/campaigns',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const status = ctx.url.searchParams.get('status') || undefined;
      const where: Record<string, unknown> = {
        organizationId: orgCtx.organization.id,
        deletedAt: null
      };
      if (status) where.status = status;
      const result = await paginate(
        ctx.db.campaign,
        where,
        parsePagination(ctx.url),
        { createdAt: 'desc' },
        { _count: { select: { runs: true } } }
      );
      sendJson(res, 200, result);
    }
  },
  {
    method: 'GET',
    pattern: '/api/campaigns/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const { id } = ctx.params;
      const campaign = await ctx.db.campaign.findFirst({
        where: { id, organizationId: orgCtx.organization.id, deletedAt: null },
        include: { runs: { orderBy: { createdAt: 'desc' }, take: 20 } }
      });
      if (!campaign) return sendJson(res, 404, { error: '活动不存在' });
      sendJson(res, 200, campaign);
    }
  },
  {
    method: 'POST',
    pattern: '/api/campaigns',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'content:create'))
        return sendJson(res, 403, { error: '权限不足' });
      const bodyResult = validateBody(createCampaignSchema as never, ctx.body);
      if (!bodyResult.success)
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      const body = bodyResult.data as Record<string, unknown>;
      const campaign = await ctx.db.campaign.create({
        data: {
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id,
          name: String(body.name),
          description: body.description as string | undefined,
          status: 'draft',
          platforms: body.platforms as never,
          contentType: String(body.contentType ?? 'text_image'),
          scheduleConfig: body.scheduleConfig as never,
          topicConfig: body.topicConfig as never,
          autoPublish: body.autoPublish as boolean,
          autoCompliance: body.autoCompliance as boolean,
          maxPostsTotal: body.maxPostsTotal as number | undefined
        }
      });
      sendJson(res, 201, campaign);
    }
  },
  {
    method: 'PUT',
    pattern: '/api/campaigns/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'content:edit'))
        return sendJson(res, 403, { error: '权限不足' });
      const { id } = ctx.params;
      const bodyResult = validateBody(updateCampaignSchema as never, ctx.body);
      if (!bodyResult.success)
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      const body = bodyResult.data as Record<string, unknown>;
      const data: Record<string, unknown> = {};
      if (body.name != null) data.name = String(body.name);
      if (body.description != null) data.description = String(body.description);
      if (body.platforms != null) data.platforms = body.platforms;
      if (body.contentType != null) data.contentType = String(body.contentType);
      if (body.scheduleConfig != null)
        data.scheduleConfig = body.scheduleConfig;
      if (body.topicConfig != null) data.topicConfig = body.topicConfig;
      if (body.autoPublish != null) data.autoPublish = body.autoPublish;
      if (body.autoCompliance != null)
        data.autoCompliance = body.autoCompliance;
      if (body.maxPostsTotal != null) data.maxPostsTotal = body.maxPostsTotal;
      if (body.status != null) data.status = String(body.status);
      const campaign = await ctx.db.campaign.update({
        where: { id, organizationId: orgCtx.organization.id },
        data
      });
      sendJson(res, 200, campaign);
    }
  },
  {
    method: 'PATCH',
    pattern: '/api/campaigns/:id/start',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const { id } = ctx.params;
      const campaign = await ctx.db.campaign.findFirst({
        where: { id, organizationId: orgCtx.organization.id, deletedAt: null }
      });
      if (!campaign) return sendJson(res, 404, { error: '活动不存在' });
      // Compute first nextRunAt
      const scheduleConfig = campaign.scheduleConfig as Record<
        string,
        unknown
      > | null;
      const nextRunAt = new Date();
      if (scheduleConfig?.time) {
        const [h, m] = (scheduleConfig.time as string).split(':').map(Number);
        nextRunAt.setHours(h, m, 0, 0);
        if (nextRunAt <= new Date()) nextRunAt.setDate(nextRunAt.getDate() + 1);
      } else {
        nextRunAt.setDate(nextRunAt.getDate() + 1);
        nextRunAt.setHours(9, 0, 0, 0);
      }
      const updated = await ctx.db.campaign.update({
        where: { id },
        data: { status: 'active', startedAt: new Date(), nextRunAt }
      });
      sendJson(res, 200, updated);
    }
  },
  {
    method: 'PATCH',
    pattern: '/api/campaigns/:id/pause',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const { id } = ctx.params;
      const updated = await ctx.db.campaign.update({
        where: { id, organizationId: orgCtx.organization.id },
        data: { status: 'paused' }
      });
      sendJson(res, 200, updated);
    }
  },
  {
    method: 'POST',
    pattern: '/api/campaigns/:id/run-now',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const { id } = ctx.params;
      const campaign = await ctx.db.campaign.findFirst({
        where: { id, organizationId: orgCtx.organization.id, deletedAt: null }
      });
      if (!campaign) return sendJson(res, 404, { error: '活动不存在' });
      const run = await ctx.db.campaignRun.create({
        data: { campaignId: id, status: 'pending', scheduledAt: new Date() }
      });
      const { Queue } = await import('bullmq');
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      const connection = { url: redisUrl };
      const queue = new Queue('campaign.execute', { connection });
      await queue.add(
        'campaign.execute',
        { campaignRunId: run.id },
        { attempts: 2, backoff: { type: 'exponential', delay: 10000 } }
      );
      sendJson(res, 200, { ok: true, runId: run.id });
    }
  },
  {
    method: 'DELETE',
    pattern: '/api/campaigns/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'content:delete'))
        return sendJson(res, 403, { error: '权限不足' });
      const { id } = ctx.params;
      await ctx.db.campaign.update({
        where: { id, organizationId: orgCtx.organization.id },
        data: { status: 'archived', deletedAt: new Date() }
      });
      sendJson(res, 200, { ok: true });
    }
  },

  // ── Workflows ──────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/workflows',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const result = await paginate(
        ctx.db.workflow,
        { organizationId: orgCtx.organization.id, deletedAt: null },
        parsePagination(ctx.url),
        { createdAt: 'desc' },
        { _count: { select: { executions: true } } }
      );
      sendJson(res, 200, result);
    }
  },
  {
    method: 'GET',
    pattern: '/api/workflows/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const workflow = await ctx.db.workflow.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        },
        include: { executions: { orderBy: { createdAt: 'desc' }, take: 20 } }
      });
      if (!workflow) return sendJson(res, 404, { error: '工作流不存在' });
      sendJson(res, 200, workflow);
    }
  },
  {
    method: 'POST',
    pattern: '/api/workflows',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown> | null;
      if (!body?.name || !body?.steps)
        return sendJson(res, 400, { error: '缺少 name 或 steps' });
      const workflow = await ctx.db.workflow.create({
        data: {
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id,
          name: String(body.name),
          description: String(body.description || ''),
          status: 'draft',
          steps: body.steps as never,
          triggerConfig: (body.triggerConfig as never) || {}
        }
      });
      sendJson(res, 201, workflow);
    }
  },
  {
    method: 'PUT',
    pattern: '/api/workflows/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown> | null;
      if (!body) return sendJson(res, 400, { error: '请求体为空' });
      const data: Record<string, unknown> = {};
      if (body.name != null) data.name = String(body.name);
      if (body.description != null) data.description = String(body.description);
      if (body.steps != null) data.steps = body.steps;
      if (body.triggerConfig != null) data.triggerConfig = body.triggerConfig;
      if (body.status != null) data.status = String(body.status);
      const workflow = await ctx.db.workflow.update({
        where: { id: ctx.params.id, organizationId: orgCtx.organization.id },
        data
      });
      sendJson(res, 200, workflow);
    }
  },
  {
    method: 'POST',
    pattern: '/api/workflows/:id/execute',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const workflow = await ctx.db.workflow.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!workflow) return sendJson(res, 404, { error: '工作流不存在' });
      const execution = await ctx.db.workflowExecution.create({
        data: { workflowId: workflow.id, status: 'running', stepResults: [] }
      });
      const { Queue } = await import('bullmq');
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      const queue = new Queue('workflow.execute', {
        connection: { url: redisUrl }
      });
      await queue.add(
        'workflow.execute',
        { executionId: execution.id },
        { attempts: 2, backoff: { type: 'exponential', delay: 10000 } }
      );
      sendJson(res, 200, { ok: true, executionId: execution.id });
    }
  },
  {
    method: 'GET',
    pattern: '/api/workflows/:id/executions',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const executions = await ctx.db.workflowExecution.findMany({
        where: {
          workflow: {
            id: ctx.params.id,
            organizationId: orgCtx.organization.id
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      });
      sendJson(res, 200, { items: executions });
    }
  },
  {
    method: 'PATCH',
    pattern: '/api/workflows/:id/pause',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const updated = await ctx.db.workflow.update({
        where: { id: ctx.params.id, organizationId: orgCtx.organization.id },
        data: { status: 'paused' }
      });
      sendJson(res, 200, updated);
    }
  },
  {
    method: 'POST',
    pattern: '/api/workflows/from-template',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown> | null;
      if (!body?.template)
        return sendJson(res, 400, { error: '缺少 template 参数' });
      const { getWorkflowTemplate } =
        await import('./services/workflow-templates.js');
      const template = getWorkflowTemplate(String(body.template));
      if (!template)
        return sendJson(res, 400, { error: `模板 "${body.template}" 不存在` });
      const workflow = await ctx.db.workflow.create({
        data: {
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id,
          name: String(body.name || template.name),
          description: template.description,
          status: 'draft',
          steps: template.steps as never,
          triggerConfig: (body.triggerConfig as never) || {}
        }
      });
      sendJson(res, 201, workflow);
    }
  },
  {
    method: 'DELETE',
    pattern: '/api/workflows/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      await ctx.db.workflow.update({
        where: { id: ctx.params.id, organizationId: orgCtx.organization.id },
        data: { status: 'archived', deletedAt: new Date() }
      });
      sendJson(res, 200, { ok: true });
    }
  },

  // ── Content Items ──────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/content-items',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const { page, pageSize } = parsePagination(ctx.url);
      const result = await paginate(
        ctx.db.contentItem,
        { organizationId: orgCtx.organization.id, deletedAt: null },
        { page, pageSize },
        { createdAt: 'desc' },
        { contentVariants: true }
      );
      sendJson(res, 200, result);
    }
  },
  {
    method: 'GET',
    pattern: '/api/content-items/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const item = await ctx.db.contentItem.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        },
        include: { contentVariants: true }
      });
      if (!item) return sendJson(res, 404, { error: 'Not found' });
      sendJson(res, 200, item);
    }
  },
  {
    method: 'POST',
    pattern: '/api/content-items',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const bodyResult = validateBody(createContentItemSchema, ctx.body);
      if (!bodyResult.success)
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      const body = bodyResult.data as Record<string, unknown>;
      let projectId = body.projectId as string | undefined;
      if (!projectId) {
        projectId = await getOrCreateDefaultProject(
          ctx.db,
          orgCtx.user.id,
          orgCtx.organization.id
        );
      }

      // Handle uploaded files
      const mediaAssetIds: string[] = [];
      for (const file of ctx.files) {
        const saved = saveUploadedFile(file);
        const asset = await ctx.db.mediaAsset.create({
          data: {
            organizationId: orgCtx.organization.id,
            userId: orgCtx.user.id,
            fileName: saved.fileName,
            fileType: resolveContentType(file),
            fileSize: file.buffer.length,
            sourceType: 'uploaded',
            sourceUrl: saved.sourceUrl,
            reviewStatus: 'pending_review'
          }
        });
        mediaAssetIds.push(asset.id);
      }
      if (Array.isArray(body.mediaAssetIds)) {
        mediaAssetIds.push(...(body.mediaAssetIds as string[]));
      }

      const item = await ctx.db.contentItem.create({
        data: {
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id,
          projectId,
          type: String(body.type ?? 'text_image') as never,
          title: String(body.title ?? ''),
          body: String(body.body ?? ''),
          status: 'draft',
          sourceType: String(body.sourceType ?? 'manual'),
          metadata: mediaAssetIds.length > 0 ? { mediaAssetIds } : {}
        }
      });
      sendJson(res, 201, item);
    }
  },
  {
    method: 'POST',
    pattern: '/api/content-items/generate-with-media',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (isRateLimited(`ai-gen:${orgCtx.organization.id}`, 10, 60_000))
        return sendJson(res, 429, { error: 'AI 生成操作过于频繁，请稍后再试' });
      const body = ctx.body as Record<string, unknown> | null;
      if (!body?.topic) return sendJson(res, 400, { error: '缺少 topic 参数' });

      try {
        const { generateContentWithMedia } =
          await import('./services/content-media-generation.js');
        const result = await generateContentWithMedia(ctx.db, {
          topic: body.topic as string,
          contentType: (body.contentType as string) || 'text_image',
          keywords: body.keywords as string[] | undefined,
          brandTone: body.brandTone as string | undefined,
          imageStyle: body.imageStyle as string | undefined,
          imageCount: (body.imageCount as number) || 1,
          orgId: orgCtx.organization.id,
          userId: orgCtx.user.id
        });
        sendJson(res, 201, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJson(res, 500, { error: '内容生成失败', detail: msg });
      }
    }
  },
  {
    method: 'PUT',
    pattern: '/api/content-items/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const bodyResult = validateBody(updateContentItemSchema, ctx.body);
      if (!bodyResult.success)
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      const body = bodyResult.data as Record<string, unknown>;
      const existing = await ctx.db.contentItem.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!existing) return sendJson(res, 404, { error: 'Not found' });

      const existingMeta = (existing.metadata as Record<string, unknown>) ?? {};
      const nextMediaAssetIds = Array.isArray(body.mediaAssetIds)
        ? (body.mediaAssetIds as string[])
        : (existingMeta.mediaAssetIds as string[] | undefined);

      const item = await ctx.db.contentItem.update({
        where: { id: ctx.params.id },
        data: {
          ...(body.title != null && { title: String(body.title) }),
          ...(body.body != null && { body: String(body.body) }),
          ...(body.status != null && { status: String(body.status) as never }),
          ...(body.type != null && { type: String(body.type) as never }),
          metadata: {
            ...existingMeta,
            ...(nextMediaAssetIds != null && {
              mediaAssetIds: nextMediaAssetIds
            })
          }
        }
      });

      if (Array.isArray(nextMediaAssetIds) && nextMediaAssetIds.length > 0) {
        await ctx.db.contentVariant.updateMany({
          where: { contentItemId: ctx.params.id, deletedAt: null },
          data: { mediaAssetIds: nextMediaAssetIds as never }
        });
      }

      sendJson(res, 200, item);
    }
  },
  {
    method: 'DELETE',
    pattern: '/api/content-items/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const item = await ctx.db.contentItem.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        },
        include: { contentVariants: { include: { publishJobs: true } } }
      });
      if (!item) return sendJson(res, 404, { error: 'Not found' });
      const hasPublished = item.contentVariants.some((v) =>
        v.publishJobs.some((j) => j.status === 'PUBLISHED')
      );
      if (hasPublished)
        return sendJson(res, 400, {
          error: {
            code: 'HAS_PUBLISHED',
            message: 'Cannot delete content with published variants'
          }
        });
      await ctx.db.contentItem.update({
        where: { id: ctx.params.id },
        data: { deletedAt: new Date() }
      });
      sendJson(res, 200, { ok: true });
    }
  },
  {
    method: 'POST',
    pattern: '/api/content-items/:id/compliance-check',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const item = await ctx.db.contentItem.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!item) return sendJson(res, 404, { error: 'Not found' });

      let passed = true;
      let issues: Array<{ rule: string; message: string; severity: string }> =
        [];
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      let suggestedFixes: Array<{ issue: string; suggestion: string }> | null =
        null;
      let aiChecked = false;

      // Attempt AI-powered compliance check
      try {
        const skillResult = await runSkillSafely<{
          passed: boolean;
          issues?: Array<{ rule: string; message: string; severity: string }>;
          riskLevel?: 'low' | 'medium' | 'high';
          suggestedFixes?: Array<{ issue: string; suggestion: string }>;
        }>('compliance-check', {
          title: item.title,
          body: item.body,
          contentType: item.type
        });

        if (skillResult?.status === 'success' && skillResult.output) {
          const out = skillResult.output;
          passed = out.passed ?? true;
          issues = out.issues ?? [];
          riskLevel = out.riskLevel ?? (issues.length > 0 ? 'medium' : 'low');
          suggestedFixes = out.suggestedFixes ?? null;
          aiChecked = true;
        }
      } catch {
        // Graceful degradation: basic pass
      }

      if (!aiChecked) {
        issues = [
          {
            rule: 'ai_unavailable',
            message:
              'AI compliance check unavailable; manual review recommended',
            severity: 'info'
          }
        ];
      }

      const result = await ctx.db.skillRun.create({
        data: {
          organizationId: orgCtx.organization.id,
          userId: item.userId,
          skillName: 'compliance_check',
          status: aiChecked ? 'success' : 'failed',
          input: { contentItemId: item.id },
          output: { passed, issues, riskLevel, suggestedFixes, aiChecked }
        }
      });
      sendJson(res, 200, {
        skillRunId: result.id,
        passed,
        riskLevel,
        issues,
        suggestedFixes,
        aiChecked
      });
    }
  },
  {
    method: 'GET',
    pattern: '/api/content-items/:contentItemId/variants',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const { page, pageSize } = parsePagination(ctx.url);
      const result = await paginate(
        ctx.db.contentVariant,
        {
          contentItemId: ctx.params.contentItemId,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        },
        { page, pageSize },
        { platform: 'asc' }
      );
      sendJson(res, 200, result);
    }
  },
  {
    method: 'POST',
    pattern: '/api/content-items/:contentItemId/generate-variants',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const bodyResult = validateBody(batchGenerateVariantsSchema, ctx.body);
      if (!bodyResult.success)
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      const body = bodyResult.data as { platforms?: string[] } | null;
      const contentItem = await ctx.db.contentItem.findFirstOrThrow({
        where: { id: ctx.params.contentItemId, deletedAt: null }
      });
      const allPlatforms = [
        'douyin',
        'xiaohongshu',
        'wechat_official',
        'wechat_channels',
        'baijiahao',
        'zhihu'
      ];
      const platforms = body?.platforms?.length ? body.platforms : allPlatforms;
      const existing = await ctx.db.contentVariant.findMany({
        where: { contentItemId: contentItem.id, deletedAt: null },
        select: { platform: true }
      });
      const existingPlatforms = new Set(existing.map((v) => v.platform));
      const toCreate = platforms.filter(
        (p: string) => !existingPlatforms.has(p as never)
      );

      // Attempt AI-powered platform-specific rewrite for each platform
      const variants = await Promise.all(
        toCreate.map(async (platform) => {
          let title = contentItem.title;
          let bodyText = contentItem.body;
          let tags: string[] = [];
          let cta = '';

          try {
            const skillResult = await runSkillSafely<{
              title?: string;
              body?: string;
              tags?: string[];
              cta?: string;
            }>('platform-rewrite', {
              sourceTitle: contentItem.title,
              sourceBody: contentItem.body,
              platform,
              contentType: contentItem.type
            });

            if (skillResult?.status === 'success' && skillResult.output) {
              const out = skillResult.output;
              title = out.title ?? contentItem.title;
              bodyText = out.body ?? contentItem.body;
              tags = out.tags ?? [];
              cta = out.cta ?? '';
            }
          } catch {
            // Graceful degradation: use content as-is
          }

          const itemMediaAssetIds =
            ((contentItem.metadata as Record<string, unknown>)
              ?.mediaAssetIds as string[] | undefined) ?? [];

          return ctx.db.contentVariant.create({
            data: {
              organizationId: orgCtx.organization.id,
              userId: orgCtx.user.id,
              contentItemId: contentItem.id,
              platform: platform as 'douyin',
              contentType: contentItem.type as 'text_image',
              title,
              body: bodyText,
              tags: tags as never,
              cta,
              complianceStatus: 'approved',
              ...(itemMediaAssetIds.length > 0 && {
                mediaAssetIds: itemMediaAssetIds as never
              })
            }
          });
        })
      );
      sendJson(res, 201, variants);
    }
  },

  // ── Content Variants ──────────────────────────────────────────
  {
    method: 'PUT',
    pattern: '/api/content-variants/:variantId',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const bodyResult = validateBody(updateContentVariantSchema, ctx.body);
      if (!bodyResult.success)
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      const body = bodyResult.data as {
        title?: string;
        body?: string;
        tags?: string[];
      };
      try {
        const variant = await ctx.db.contentVariant.update({
          where: { id: ctx.params.variantId },
          data: {
            ...(body.title !== undefined && { title: body.title }),
            ...(body.body !== undefined && { body: body.body }),
            ...(body.tags !== undefined && { tags: body.tags as never })
          }
        });
        sendJson(res, 200, variant);
      } catch {
        sendJson(res, 404, { error: 'Variant not found' });
      }
    }
  },
  {
    method: 'POST',
    pattern: '/api/content-variants/:id/compliance-check',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const variant = await ctx.db.contentVariant.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!variant) return sendJson(res, 404, { error: 'Not found' });

      let passed = true;
      let issues: Array<{ rule: string; message: string; severity: string }> =
        [];
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      let suggestedFixes: Array<{ issue: string; suggestion: string }> | null =
        null;
      let aiChecked = false;

      // Attempt AI-powered compliance check
      try {
        const skillResult = await runSkillSafely<{
          passed: boolean;
          issues?: Array<{ rule: string; message: string; severity: string }>;
          riskLevel?: 'low' | 'medium' | 'high';
          suggestedFixes?: Array<{ issue: string; suggestion: string }>;
        }>('compliance-check', {
          title: variant.title,
          body: variant.body,
          platform: variant.platform,
          contentType: variant.contentType,
          tags: variant.tags,
          cta: variant.cta
        });

        if (skillResult?.status === 'success' && skillResult.output) {
          const out = skillResult.output;
          passed = out.passed ?? true;
          issues = out.issues ?? [];
          riskLevel = out.riskLevel ?? (issues.length > 0 ? 'medium' : 'low');
          suggestedFixes = out.suggestedFixes ?? null;
          aiChecked = true;
        }
      } catch {
        // Graceful degradation: basic pass
      }

      if (!aiChecked) {
        issues = [
          {
            rule: 'ai_unavailable',
            message:
              'AI compliance check unavailable; manual review recommended',
            severity: 'info'
          }
        ];
      }

      const check = await ctx.db.contentComplianceCheck.create({
        data: {
          contentVariantId: variant.id,
          status: passed ? 'passed' : 'failed',
          riskLevel,
          issues: issues as never,
          suggestedFixes: suggestedFixes as never
        }
      });

      // Update variant compliance status
      await ctx.db.contentVariant.update({
        where: { id: variant.id },
        data: { complianceStatus: passed ? 'approved' : 'rejected' }
      });

      sendJson(res, 200, {
        id: check.id,
        passed,
        riskLevel,
        issues,
        suggestedFixes,
        aiChecked
      });
    }
  },
  {
    method: 'PATCH',
    pattern: '/api/content-variants/:id/approve',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const variant = await ctx.db.contentVariant.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        },
        include: {
          complianceChecks: { orderBy: { createdAt: 'desc' }, take: 1 }
        }
      });
      if (!variant) return sendJson(res, 404, { error: 'Not found' });

      // Check latest compliance check - skip if no check exists (no check required)
      const latestCheck = variant.complianceChecks[0];
      if (latestCheck && latestCheck.status === 'failed') {
        return sendJson(res, 400, {
          error: {
            code: 'COMPLIANCE_FAILED',
            message: 'Cannot approve variant that failed compliance check',
            issues: latestCheck.issues
          }
        });
      }

      const updated = await ctx.db.contentVariant.update({
        where: { id: ctx.params.id },
        data: { complianceStatus: 'approved' }
      });

      // Write audit log
      await ctx.db.auditLog.create({
        data: {
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id,
          action: 'approve',
          entity: 'ContentVariant',
          entityId: variant.id,
          changes: {
            complianceStatus: {
              from: variant.complianceStatus,
              to: 'approved'
            },
            platform: variant.platform
          }
        }
      });

      sendJson(res, 200, updated);
    }
  },
  {
    method: 'POST',
    pattern: '/api/content-variants/:id/create-publish-job',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const variant = await ctx.db.contentVariant.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!variant) return sendJson(res, 404, { error: 'Not found' });

      // Verify the variant is approved
      if (variant.complianceStatus !== 'approved') {
        return sendJson(res, 400, {
          error: {
            code: 'NOT_APPROVED',
            message:
              'Content variant must be approved before creating a publish job'
          }
        });
      }

      // Check media assets are approved (if any)
      const mediaAssetIds = variant.mediaAssetIds as string[] | null;
      if (mediaAssetIds && mediaAssetIds.length > 0) {
        const unapprovedAssets = await ctx.db.mediaAsset.findMany({
          where: {
            id: { in: mediaAssetIds },
            reviewStatus: { not: 'approved' }
          }
        });
        if (unapprovedAssets.length > 0) {
          return sendJson(res, 400, {
            error: {
              code: 'MEDIA_NOT_APPROVED',
              message: `${unapprovedAssets.length} media asset(s) have not been approved`,
              unapprovedAssetIds: unapprovedAssets.map((a) => a.id)
            }
          });
        }
      }

      // Find a matching platform account for this variant's platform
      const account = await ctx.db.platformAccount.findFirst({
        where: {
          organizationId: orgCtx.organization.id,
          platform: variant.platform,
          deletedAt: null
        }
      });
      if (!account) {
        return sendJson(res, 400, {
          error: {
            code: 'NO_PLATFORM_ACCOUNT',
            message: `No platform account found for ${variant.platform}`
          }
        });
      }

      // Check for existing publish job to avoid duplicate
      const existingJob = await ctx.db.publishJob.findFirst({
        where: {
          contentVariantId: variant.id,
          platformAccountId: account.id,
          mode: account.mode,
          deletedAt: null
        }
      });
      if (existingJob) {
        return sendJson(res, 200, existingJob);
      }

      const body = ctx.body as { scheduledAt?: string } | null;
      const scheduledAt = body?.scheduledAt ? new Date(body.scheduledAt) : null;

      const job = await ctx.db.publishJob.create({
        data: {
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id,
          contentVariantId: variant.id,
          platformAccountId: account.id,
          platform: variant.platform,
          contentType: variant.contentType,
          mode: account.mode,
          status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
          scheduledAt
        }
      });

      sendJson(res, 201, job);
    }
  },

  // ── Media Assets ───────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/media-assets',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const { page, pageSize } = parsePagination(ctx.url);
      const where: Record<string, unknown> = {
        organizationId: orgCtx.organization.id,
        deletedAt: null
      };
      const reviewStatus = ctx.url.searchParams.get('reviewStatus');
      if (reviewStatus) where.reviewStatus = reviewStatus;
      const sourceType = ctx.url.searchParams.get('sourceType');
      if (sourceType) where.sourceType = sourceType;
      const idsParam = ctx.url.searchParams.get('ids');
      if (idsParam) where.id = { in: idsParam.split(',').filter(Boolean) };
      const result = await paginate(
        ctx.db.mediaAsset,
        where,
        { page, pageSize },
        { createdAt: 'desc' }
      );
      sendJson(res, 200, result);
    }
  },
  {
    method: 'POST',
    pattern: '/api/media-assets',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const items = [];
      for (const file of ctx.files) {
        const saved = saveUploadedFile(file);
        const item = await ctx.db.mediaAsset.create({
          data: {
            organizationId: orgCtx.organization.id,
            userId: orgCtx.user.id,
            fileName: saved.fileName,
            fileType: resolveContentType(file),
            fileSize: file.buffer.length,
            sourceType: 'uploaded',
            sourceUrl: saved.sourceUrl,
            reviewStatus: 'pending_review'
          }
        });
        items.push(item);
      }
      if (items.length === 0) {
        const body = ctx.body as Record<string, unknown>;
        const item = await ctx.db.mediaAsset.create({
          data: {
            organizationId: orgCtx.organization.id,
            userId: orgCtx.user.id,
            fileName: String(body.fileName ?? 'untitled'),
            fileType: String(body.fileType ?? 'application/octet-stream'),
            fileSize: body.fileSize as number | undefined,
            sourceType: String(body.sourceType ?? 'uploaded') as never,
            sourceUrl: (body.sourceUrl ?? body.storageUrl) as
              | string
              | undefined,
            reviewStatus: 'pending_review',
            metadata: ((body.metadata as Record<string, unknown>) ??
              {}) as never
          }
        });
        sendJson(res, 201, item);
      } else {
        sendJson(res, 201, items.length === 1 ? items[0] : items);
      }
    }
  },
  {
    method: 'PUT',
    pattern: '/api/media-assets/:id/review',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown>;
      const existing = await ctx.db.mediaAsset.findFirst({
        where: { id: ctx.params.id, organizationId: orgCtx.organization.id }
      });
      if (!existing) return sendJson(res, 404, { error: 'Not found' });
      const existingMeta = (existing.metadata as Record<string, unknown>) ?? {};
      const item = await ctx.db.mediaAsset.update({
        where: { id: ctx.params.id },
        data: {
          reviewStatus: String(body.status ?? 'approved') as never,
          metadata: { ...existingMeta, reviewNote: body.note ?? null }
        }
      });
      sendJson(res, 200, item);
    }
  },
  {
    method: 'POST',
    pattern: '/api/media-assets/generate',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (isRateLimited(`media-gen:${orgCtx.organization.id}`, 15, 60_000))
        return sendJson(res, 429, {
          error: '图片生成操作过于频繁，请稍后再试'
        });
      const body = ctx.body as Record<string, unknown>;
      const prompt = String(body.prompt ?? '');
      const generationType = String(body.generationType ?? 'image');
      const style = String(body.style ?? '');
      const size = String(body.size ?? '1024x1024');

      if (!prompt.trim())
        return sendJson(res, 400, { error: '请输入生成描述' });

      try {
        // Determine which provider to use
        const genMode = process.env.MEDIA_GEN_MODE ?? 'llm_provider';
        const genProvider = process.env.MEDIA_GEN_PROVIDER ?? 'openai';
        let apiKey: string;
        let baseUrl: string;
        let model: string;

        if (genMode === 'dedicated' && process.env.MEDIA_GEN_API_KEY) {
          apiKey = process.env.MEDIA_GEN_API_KEY;
          baseUrl =
            process.env.MEDIA_GEN_BASE_URL ?? 'https://api.openai.com/v1';
          model = process.env.MEDIA_GEN_MODEL ?? 'dall-e-3';
        } else {
          // Reuse LLM provider config
          apiKey = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
          baseUrl = process.env.AI_BASE_URL ?? 'https://api.openai.com/v1';
          model = process.env.AI_IMAGE_MODEL ?? 'dall-e-3';
        }

        if (!apiKey)
          return sendJson(res, 503, {
            error: 'AI 服务未配置，请先在设置中配置 API Key'
          });

        // Call image generation API (OpenAI-compatible /v1/images/generations)
        const fullPrompt = style ? `${prompt}, ${style}风格` : prompt;
        const genResponse = await fetch(`${baseUrl}/images/generations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            prompt: fullPrompt,
            n: 1,
            size,
            response_format: 'b64_json'
          })
        });

        if (!genResponse.ok) {
          const errBody = await genResponse.text();
          console.error(
            'Image generation failed:',
            genResponse.status,
            errBody
          );
          return sendJson(res, 502, { error: '图片生成失败，请检查 AI 配置' });
        }

        const genResult = (await genResponse.json()) as Record<string, unknown>;
        const resultData = genResult.data as
          | Array<Record<string, unknown>>
          | undefined;
        const imageData = resultData?.[0];
        if (!imageData) return sendJson(res, 502, { error: '生成结果为空' });

        // Save generated image to uploads
        const imageBuffer = imageData.b64_json
          ? Buffer.from(imageData.b64_json as string, 'base64')
          : null;
        const imageUrl = (imageData.url as string) ?? null;

        if (!existsSync(UPLOADS_DIR))
          mkdirSync(UPLOADS_DIR, { recursive: true });
        const savedName = `${randomUUID()}.png`;
        const filePath = join(UPLOADS_DIR, savedName);

        if (imageBuffer) {
          writeFileSync(filePath, imageBuffer);
        } else if (imageUrl) {
          // Download from URL
          const imgResp = await fetch(imageUrl);
          const imgBuf = Buffer.from(await imgResp.arrayBuffer());
          writeFileSync(filePath, imgBuf);
        } else {
          return sendJson(res, 502, { error: '无法获取生成图片' });
        }

        // Create a simple hash for dedup
        const promptHash = prompt.trim().slice(0, 64);

        const asset = await ctx.db.mediaAsset.create({
          data: {
            organizationId: orgCtx.organization.id,
            userId: orgCtx.user.id,
            fileName: `ai-generated-${savedName}`,
            fileType: 'image/png',
            fileSize: imageBuffer?.length ?? 0,
            sourceType: 'generated_future',
            sourceUrl: `/uploads/${savedName}`,
            reviewStatus: 'pending_review',
            generationProvider: `${genProvider}/${model}`,
            generationPromptHash: promptHash,
            costEstimate: (
              genResult.usage as Record<string, number> | undefined
            )?.total_tokens
              ? (genResult.usage as Record<string, number>).total_tokens *
                0.00004
              : 0.04,
            metadata: {
              prompt,
              generationType,
              style,
              size,
              revisedPrompt: (imageData.revised_prompt as string) ?? null
            } as never
          }
        });

        sendJson(res, 201, asset);
      } catch (err: unknown) {
        console.error('Media generation error:', err);
        sendJson(res, 500, {
          error:
            '素材生成失败: ' + (err instanceof Error ? err.message : '未知错误')
        });
      }
    }
  },

  // ── Publish Jobs ───────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/publish-jobs',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const { page, pageSize } = parsePagination(ctx.url);
      const where: Record<string, unknown> = {
        organizationId: orgCtx.organization.id,
        deletedAt: null
      };
      const status = ctx.url.searchParams.get('status');
      if (status) where.status = status;
      const platform = ctx.url.searchParams.get('platform');
      if (platform) where.platform = platform;
      const result = await paginate(
        ctx.db.publishJob,
        where,
        { page, pageSize },
        { createdAt: 'desc' },
        {
          contentVariant: true,
          platformAccount: true,
          publishAttempts: { orderBy: { attemptNo: 'desc' } }
        }
      );
      sendJson(res, 200, result);
    }
  },
  {
    method: 'GET',
    pattern: '/api/publish-jobs/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const item = await ctx.db.publishJob.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        },
        include: {
          contentVariant: true,
          platformAccount: true,
          publishAttempts: { orderBy: { attemptNo: 'desc' } }
        }
      });
      if (!item) return sendJson(res, 404, { error: 'Not found' });
      sendJson(res, 200, item);
    }
  },
  {
    method: 'GET',
    pattern: '/api/publish-jobs/:jobId/attempts',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      // Verify the publish job belongs to this org
      const job = await ctx.db.publishJob.findFirst({
        where: {
          id: ctx.params.jobId,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        },
        select: { id: true }
      });
      if (!job) return sendJson(res, 404, { error: 'Not found' });
      const items = await ctx.db.publishAttempt.findMany({
        where: { publishJobId: ctx.params.jobId },
        orderBy: { attemptNo: 'desc' }
      });
      sendJson(res, 200, items);
    }
  },
  {
    method: 'POST',
    pattern: '/api/publish-jobs',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const bodyResult = validateBody(
        createPublishJobSchema as never,
        ctx.body
      );
      if (!bodyResult.success)
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      const body = bodyResult.data as Record<string, unknown>;
      const account = await ctx.db.platformAccount.findFirst({
        where: {
          id: String(body.platformAccountId ?? ''),
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      const mode = account?.mode ?? String(body.mode ?? 'official_api');
      const scheduledAt =
        body.scheduledAt instanceof Date
          ? body.scheduledAt
          : body.scheduledAt
            ? new Date(body.scheduledAt as string)
            : null;
      const item = await ctx.db.publishJob.create({
        data: {
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id,
          contentVariantId: String(body.contentVariantId ?? ''),
          platformAccountId: String(body.platformAccountId ?? ''),
          platform: String(body.platform ?? 'douyin') as 'douyin',
          contentType: String(body.contentType ?? 'text_image') as 'text_image',
          mode: mode as 'official_api',
          status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
          scheduledAt
        }
      });
      sendJson(res, 201, item);
    }
  },
  {
    method: 'POST',
    pattern: '/api/publish-jobs/batch',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (isRateLimited(`publish:${orgCtx.organization.id}`, 10, 60_000))
        return sendJson(res, 429, { error: '发布操作过于频繁，请稍后再试' });
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const bodyResult = validateBody(batchPublishSchema, ctx.body);
      if (!bodyResult.success)
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      const body = bodyResult.data as {
        contentItemId?: string;
        platformAccountIds?: string[];
        scheduledAt?: string;
      };
      const { contentItemId, platformAccountIds, scheduledAt } = body;

      const [contentItem, variants, accounts] = await Promise.all([
        ctx.db.contentItem.findFirst({
          where: {
            id: contentItemId,
            organizationId: orgCtx.organization.id,
            deletedAt: null
          }
        }),
        ctx.db.contentVariant.findMany({
          where: {
            contentItemId,
            organizationId: orgCtx.organization.id,
            deletedAt: null
          }
        }),
        ctx.db.platformAccount.findMany({
          where: {
            id: { in: platformAccountIds },
            organizationId: orgCtx.organization.id,
            deletedAt: null
          }
        })
      ]);
      if (!contentItem) return sendJson(res, 404, { error: '内容不存在' });

      const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
      const jobs = [];

      for (const account of accounts) {
        const variant = variants.find((v) => v.platform === account.platform);
        if (!variant) continue;
        if (variant.complianceStatus === 'rejected') continue;
        if (variant.complianceStatus !== 'approved') {
          continue; // Skip variants not yet approved — do NOT auto-approve
        }
        const existing = await ctx.db.publishJob.findFirst({
          where: {
            contentVariantId: variant.id,
            platformAccountId: account.id,
            mode: account.mode,
            deletedAt: null
          }
        });
        if (existing) {
          jobs.push(existing);
          if (!scheduledDate && ['DRAFT', 'READY'].includes(existing.status)) {
            await startPublishJob(ctx.db, existing);
          }
          continue;
        }
        const job = await ctx.db.publishJob.create({
          data: {
            organizationId: orgCtx.organization.id,
            userId: orgCtx.user.id,
            contentVariantId: variant.id,
            platformAccountId: account.id,
            platform: account.platform,
            contentType: contentItem.type as 'text_image',
            mode: account.mode,
            status: scheduledDate ? 'SCHEDULED' : 'DRAFT',
            scheduledAt: scheduledDate
          }
        });
        jobs.push(job);
        if (!scheduledDate) {
          await startPublishJob(ctx.db, job);
        }
      }

      const refreshed = await ctx.db.publishJob.findMany({
        where: { id: { in: jobs.map((j) => j.id) } },
        include: { contentVariant: true, platformAccount: true }
      });
      sendJson(res, 201, refreshed);
    }
  },
  {
    method: 'POST',
    pattern: '/api/publish-jobs/:id/retry',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const existing = await ctx.db.publishJob.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!existing) return sendJson(res, 404, { error: 'Not found' });
      if (existing.retryCount >= 3) {
        return sendJson(res, 400, {
          error: { code: 'MAX_RETRIES', message: '已达到最大重试次数' }
        });
      }
      const item = await ctx.db.publishJob.update({
        where: { id: ctx.params.id },
        data: {
          status: 'RUNNING',
          retryCount: { increment: 1 },
          lastError: null,
          startedAt: new Date()
        }
      });

      try {
        await enqueuePublishJob(existing);
      } catch (err) {
        console.error('[api] Failed to re-enqueue publish job:', err);
      }

      sendJson(res, 200, item);
    }
  },
  {
    method: 'POST',
    pattern: '/api/publish-jobs/:id/cancel',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const job = await ctx.db.publishJob.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!job) return sendJson(res, 404, { error: 'Not found' });
      const item = await ctx.db.publishJob.update({
        where: { id: ctx.params.id },
        data: { status: 'CANCELLED' }
      });
      sendJson(res, 200, item);
    }
  },
  {
    method: 'DELETE',
    pattern: '/api/publish-jobs/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const job = await ctx.db.publishJob.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!job) return sendJson(res, 404, { error: '发布任务不存在' });
      if (job.status === 'RUNNING') {
        return sendJson(res, 400, {
          error: {
            code: 'JOB_RUNNING',
            message: '任务正在执行中，请等待完成或先取消再删除'
          }
        });
      }
      await ctx.db.publishJob.update({
        where: { id: ctx.params.id },
        data: { deletedAt: new Date() }
      });
      sendJson(res, 200, { ok: true });
    }
  },
  {
    method: 'POST',
    pattern: '/api/publish-jobs/:id/progress',
    handler: async (req, res, ctx) => {
      if (!isPublishProgressAuthorized(req)) {
        return sendJson(res, 401, { error: 'Unauthorized' });
      }
      const job = await ctx.db.publishJob.findFirst({
        where: { id: ctx.params.id, deletedAt: null }
      });
      if (!job) return sendJson(res, 404, { error: 'Not found' });
      const body = ctx.body as { stage?: string; message?: string };
      const stage = body?.stage;
      const validStages = [
        'queued',
        'starting',
        'browser_launch',
        'browser_page',
        'browser_fill',
        'browser_submit',
        'api_publish',
        'done',
        'failed'
      ];
      if (!stage || !validStages.includes(stage)) {
        return sendJson(res, 400, { error: 'Invalid progress stage' });
      }
      await applyPublishProgress(
        ctx.db,
        job.id,
        stage as import('@ai-growth-ops/shared').PublishProgressStage,
        body.message
      );
      sendJson(res, 200, { ok: true });
    }
  },
  {
    method: 'POST',
    pattern: '/api/publish-jobs/:id/execute',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const job = await ctx.db.publishJob.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        },
        include: { contentVariant: true, platformAccount: true }
      });
      if (!job) return sendJson(res, 404, { error: 'Not found' });
      if (!['DRAFT', 'READY', 'SCHEDULED'].includes(job.status)) {
        return sendJson(res, 400, {
          error: {
            code: 'INVALID_STATE',
            message: `Cannot execute from ${job.status} state`
          }
        });
      }
      try {
        await startPublishJob(ctx.db, job);
        const item = await ctx.db.publishJob.findFirstOrThrow({
          where: { id: job.id }
        });
        sendJson(res, 200, item);
      } catch (err) {
        console.error('[api] Failed to enqueue publish job:', err);
        sendJson(res, 500, {
          error: '发布任务入队失败，请确认 Redis 与 Worker 已启动'
        });
      }
      return;
    }
  },
  {
    method: 'POST',
    pattern: '/api/publish-jobs/:id/manual-complete',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown>;
      const job = await ctx.db.publishJob.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!job) return sendJson(res, 404, { error: 'Not found' });
      if (job.status !== 'WAITING_HUMAN_CONFIRM') {
        return sendJson(res, 400, {
          error: {
            code: 'INVALID_STATE',
            message: `Cannot manual-complete from ${job.status} state`
          }
        });
      }
      const item = await ctx.db.publishJob.update({
        where: { id: ctx.params.id },
        data: {
          status: 'PUBLISHED',
          finishedAt: new Date(),
          externalUrl: body.externalUrl as string | undefined
        }
      });
      sendJson(res, 200, item);
    }
  },
  {
    method: 'GET',
    pattern: '/api/publish-jobs/:id/logs',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const job = await ctx.db.publishJob.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!job) return sendJson(res, 404, { error: 'Not found' });
      const attempts = await ctx.db.publishAttempt.findMany({
        where: { publishJobId: ctx.params.id },
        orderBy: { attemptNo: 'desc' }
      });
      sendJson(res, 200, { job, attempts });
    }
  },

  // ── Legacy publish/execute ─────────────────────────────────────
  {
    method: 'POST',
    pattern: '/api/publish/execute',
    handler: async (_req, res, _ctx) => {
      sendJson(res, 400, {
        error: '此接口已停用，请使用 /api/publish-jobs 创建发布任务'
      });
    }
  },

  // ── Interactions ───────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/interactions',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const { page, pageSize } = parsePagination(ctx.url);
      const where: Record<string, unknown> = {
        organizationId: orgCtx.organization.id,
        deletedAt: null
      };
      const status = ctx.url.searchParams.get('status');
      if (status) where.status = status;
      const platform = ctx.url.searchParams.get('platform');
      if (platform) where.platform = platform;
      const type = ctx.url.searchParams.get('type');
      if (type) where.type = type;
      const result = await paginate(
        ctx.db.interaction,
        where,
        { page, pageSize },
        { receivedAt: 'desc' },
        { conversation: true }
      );
      sendJson(res, 200, result);
    }
  },
  {
    method: 'GET',
    pattern: '/api/interactions/:id/reply-suggestions',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const interaction = await ctx.db.interaction.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!interaction) return sendJson(res, 200, []);
      const suggestions = await ctx.db.replySuggestion.findMany({
        where: { interactionId: ctx.params.id },
        orderBy: { createdAt: 'desc' }
      });
      sendJson(res, 200, suggestions);
    }
  },
  {
    method: 'POST',
    pattern: '/api/interactions/:id/reply',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown>;
      const interaction = await ctx.db.interaction.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!interaction) return sendJson(res, 404, { error: 'Not found' });

      // Reply Policy Engine: check risk level and review requirements
      const metadata = interaction.metadata as Record<string, unknown> | null;
      const riskLevel = String(
        (body.riskLevel as string) ?? (metadata?.riskLevel as string) ?? 'low'
      );
      const needReview = Boolean(
        body.needReview ?? metadata?.needReview ?? false
      );

      if (riskLevel === 'high' || needReview) {
        // Block the reply and require human review
        await ctx.db.auditLog
          .create({
            data: {
              organizationId: orgCtx.organization.id,
              userId: interaction.userId,
              action: 'update',
              entity: 'interaction',
              entityId: ctx.params.id,
              changes: {
                before: { status: interaction.status },
                after: {
                  status: 'BLOCKED',
                  reason: `riskLevel=${riskLevel}, needReview=${needReview}`
                }
              } as never
            }
          })
          .catch(() => {
            /* auditLog table may not exist */
          });

        return sendJson(res, 403, {
          status: 'blocked',
          reason: 'Reply requires human review before sending',
          riskLevel,
          needReview
        });
      }

      // Create ReplyAttempt record (pending — worker will update on delivery)
      await ctx.db.replyAttempt
        .create({
          data: {
            replySuggestionId: (body.replySuggestionId as string) ?? '',
            platform: interaction.platform,
            providerMode: 'browser_assist',
            status: 'pending'
          }
        })
        .catch(() => {
          /* replyAttempt table may not exist yet */
        });

      // Write AuditLog for the reply action
      await ctx.db.auditLog
        .create({
          data: {
            organizationId: orgCtx.organization.id,
            userId: interaction.userId,
            action: 'update',
            entity: 'interaction',
            entityId: ctx.params.id,
            changes: {
              before: { status: interaction.status },
              after: {
                status: 'REPLY_SUGGESTED',
                replyContent: String(body.content ?? '').slice(0, 200)
              }
            } as never
          }
        })
        .catch(() => {
          /* auditLog table may not exist */
        });

      // Mark interaction as SENDING while the worker delivers the reply
      await ctx.db.interaction.update({
        where: { id: ctx.params.id },
        data: {
          status: 'REPLY_SUGGESTED',
          metadata: {
            replyContent: String(body.content ?? ''),
            riskLevel,
            needReview,
            sending: true
          } as never
        }
      });

      // Enqueue delivery job for the worker
      try {
        const { Queue } = await import('bullmq');
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        const queue = new Queue('interaction.manual-reply', {
          connection: { url: redisUrl }
        });
        await queue.add(
          'interaction.manual-reply',
          {
            interactionId: interaction.id,
            replyContent: String(body.content ?? ''),
            replySuggestionId: (body.replySuggestionId as string) ?? ''
          },
          { attempts: 2, backoff: { type: 'exponential', delay: 5000 } }
        );
        await queue.close();
      } catch (queueErr) {
        // If enqueue fails, still return accepted — the reply is recorded
        console.error(
          '[reply] Failed to enqueue delivery job:',
          queueErr instanceof Error ? queueErr.message : String(queueErr)
        );
      }

      sendJson(res, 202, { status: 'sending', interactionId: interaction.id });
    }
  },
  {
    method: 'POST',
    pattern: '/api/interactions/:id/review',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown>;
      const action = String(body.action);
      const status = action === 'reject' ? 'IGNORED' : 'REPLIED';
      const existing = await ctx.db.interaction.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!existing) return sendJson(res, 404, { error: 'Not found' });
      const item = await ctx.db.interaction.update({
        where: { id: ctx.params.id },
        data: {
          status,
          metadata: {
            reviewAction: action,
            ...(body.content ? { editedContent: body.content } : {})
          }
        }
      });
      sendJson(res, 200, item);
    }
  },
  {
    method: 'POST',
    pattern: '/api/interactions/:id/classify',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = (ctx.body ?? {}) as Record<string, unknown>;
      const interaction = await ctx.db.interaction.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        },
        include: { classification: true }
      });
      if (!interaction) return sendJson(res, 404, { error: 'Not found' });

      // Preserve existing classification as defaults (pipeline may have already classified)
      let intentLevel =
        (body.intentLevel as string) ??
        interaction.classification?.leadLevel ??
        'C';
      let intent =
        (body.intent as string) ??
        interaction.classification?.intent ??
        'unknown';
      let confidence = interaction.classification?.confidence ?? 0.5;
      let riskLevel: string = interaction.classification?.riskLevel ?? 'low';
      let summary: string = interaction.classification?.summary ?? '';
      let tags: string[] = (interaction.classification?.tags as string[]) ?? [];
      let skillUsed = false;

      // Try AI skill-based classification
      const skillResult = await runSkillSafely<{
        intentLevel: string;
        intent: string;
        confidence: number;
        riskLevel?: string;
        summary?: string;
        tags?: string[];
      }>('lead-classification', {
        interactionId: interaction.id,
        content: interaction.content,
        platform: interaction.platform,
        externalUserName: interaction.externalUserName
      });

      if (skillResult?.status === 'success' && skillResult.output) {
        intentLevel = skillResult.output.intentLevel ?? intentLevel;
        intent = skillResult.output.intent ?? intent;
        confidence = skillResult.output.confidence ?? confidence;
        riskLevel = skillResult.output.riskLevel ?? riskLevel;
        summary = skillResult.output.summary ?? summary;
        tags = skillResult.output.tags ?? tags;
        skillUsed = true;
      } else {
        // Fallback to rule-based classification when AI skill unavailable
        const ruleResult = classifyByRules(interaction.content);
        intentLevel = ruleResult.leadLevel;
        intent = ruleResult.intent;
        confidence = ruleResult.confidence;
        riskLevel = ruleResult.riskLevel;
        summary = ruleResult.summary;
        tags = ruleResult.tags;
      }

      // Create or update InteractionClassification record
      await ctx.db.interactionClassification
        .upsert({
          where: { interactionId: interaction.id },
          create: {
            interactionId: interaction.id,
            intent: String(intent),
            leadLevel: String(intentLevel),
            confidence,
            riskLevel: String(riskLevel),
            summary: summary || String(intent),
            tags: tags as never
          },
          update: {
            intent: String(intent),
            leadLevel: String(intentLevel),
            confidence,
            riskLevel: String(riskLevel),
            summary: summary || undefined,
            tags: tags.length > 0 ? (tags as never) : undefined
          }
        })
        .catch(() => {
          /* table may not exist yet */
        });

      const item = await ctx.db.interaction.update({
        where: { id: ctx.params.id },
        data: {
          status: 'CLASSIFIED',
          metadata: {
            ...(interaction.metadata as Record<string, unknown> | null),
            intentLevel: String(intentLevel),
            intent: String(intent),
            confidence,
            riskLevel,
            skillUsed
          }
        }
      });
      sendJson(res, 200, {
        ...item,
        classification: {
          intentLevel: String(intentLevel),
          intent: String(intent),
          skillUsed
        }
      });
    }
  },
  {
    method: 'POST',
    pattern: '/api/interactions/:id/suggest-reply',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const interaction = await ctx.db.interaction.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!interaction) return sendJson(res, 404, { error: 'Not found' });

      let suggestedText = `感谢您的关注！关于您提到的"${interaction.content.slice(0, 20)}..."，我们会尽快为您处理。`;
      let tone = 'professional';
      let skillUsed = false;
      let replyRiskLevel: 'low' | 'medium' | 'high' = 'low';
      let needReview = false;

      // Step 1: Generate rule-based reply as baseline (always runs)
      const classification = await ctx.db.interactionClassification.findUnique({
        where: { interactionId: interaction.id }
      });
      const classResult: import('./rule-classifier.js').ClassificationResult =
        classification
          ? {
              intent: classification.intent,
              leadLevel: classification.leadLevel as 'A' | 'B' | 'C' | 'D',
              confidence: classification.confidence,
              riskLevel:
                (classification.riskLevel as 'low' | 'medium' | 'high') ??
                'low',
              summary: classification.summary || '',
              tags: (classification.tags as string[]) || [],
              nextAction: ''
            }
          : classifyByRules(interaction.content);
      const ruleReply = generateRuleBasedReply(
        interaction.content,
        classResult,
        interaction.platform
      );
      suggestedText = ruleReply.suggestedText;
      replyRiskLevel = ruleReply.riskLevel;
      needReview = ruleReply.needReview;

      // Step 2: Try AI skill to enhance (only for low-risk, non-review replies)
      if (!needReview && replyRiskLevel !== 'high') {
        const skillResult = await runSkillSafely<{
          suggestedText: string;
          tone: string;
          confidence: number;
        }>('reply-suggestion', {
          interactionId: interaction.id,
          content: interaction.content,
          platform: interaction.platform,
          externalUserName: interaction.externalUserName
        });

        if (
          skillResult?.status === 'success' &&
          skillResult.output?.suggestedText
        ) {
          suggestedText = skillResult.output.suggestedText;
          tone = skillResult.output.tone ?? tone;
          skillUsed = true;
        }
      }

      // Create ReplySuggestion record in DB
      const suggestion = await ctx.db.replySuggestion
        .create({
          data: {
            interactionId: interaction.id,
            suggestedText,
            status: needReview ? 'waiting_review' : 'draft',
            decision: needReview
              ? 'require_human_review'
              : skillUsed
                ? 'ai_skill'
                : 'auto_send_allowed',
            riskLevel: replyRiskLevel,
            needReview
          }
        })
        .catch(() => null);

      await ctx.db.interaction.update({
        where: { id: ctx.params.id },
        data: { status: 'REPLY_SUGGESTED' }
      });

      sendJson(res, 200, [
        {
          id: suggestion?.id ?? `sug_${ctx.params.id}`,
          content: suggestedText,
          tone,
          skillUsed,
          riskLevel: replyRiskLevel,
          needReview,
          suggestionId: suggestion?.id ?? null
        }
      ]);
    }
  },
  {
    method: 'POST',
    pattern: '/api/interactions/:id/convert-to-lead',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const interaction = await ctx.db.interaction.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        },
        include: { classification: true }
      });
      if (!interaction) return sendJson(res, 404, { error: 'Not found' });
      const level = interaction.classification?.leadLevel ?? 'C';
      const lead = await ctx.db.lead.create({
        data: {
          organizationId: orgCtx.organization.id,
          userId: interaction.userId,
          sourcePlatform: interaction.platform,
          sourceAccountId: interaction.platformAccountId,
          sourceInteractionId: interaction.id,
          externalUserId: interaction.externalUserId,
          externalUserName: interaction.externalUserName,
          level: level as 'A',
          intent: interaction.classification?.intent ?? null,
          summary: interaction.content.slice(0, 200)
        }
      });
      await ctx.db.interaction.update({
        where: { id: ctx.params.id },
        data: { status: 'CONVERTED_TO_LEAD' }
      });
      sendJson(res, 201, lead);
    }
  },
  {
    method: 'POST',
    pattern: '/api/interactions/:id/ignore',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const item = await ctx.db.interaction.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!item) return sendJson(res, 404, { error: 'Not found' });
      await ctx.db.interaction.update({
        where: { id: ctx.params.id },
        data: { status: 'IGNORED' }
      });
      await ctx.db.auditLog
        .create({
          data: {
            organizationId: orgCtx.organization.id,
            userId: item.userId,
            action: 'update',
            entity: 'interaction',
            entityId: ctx.params.id,
            changes: { after: { status: 'IGNORED' } } as never
          }
        })
        .catch(() => {
          /* auditLog table may not exist */
        });
      sendJson(res, 200, { ok: true });
    }
  },
  {
    method: 'GET',
    pattern: '/api/interactions/:id/reply-attempts',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      // Verify the interaction belongs to this org
      const interaction = await ctx.db.interaction.findFirst({
        where: { id: ctx.params.id, organizationId: orgCtx.organization.id }
      });
      if (!interaction) return sendJson(res, 404, { error: 'Not found' });
      const suggestions = await ctx.db.replySuggestion
        .findMany({
          where: { interactionId: ctx.params.id },
          include: { replyAttempts: true }
        })
        .catch(() => [] as Array<{ replyAttempts: unknown[] }>);
      const attempts = suggestions.flatMap((s) => s.replyAttempts);
      sendJson(res, 200, attempts);
    }
  },
  {
    method: 'POST',
    pattern: '/api/reply-suggestions/:id/review',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown>;
      const suggestion = await ctx.db.replySuggestion.findUnique({
        where: { id: ctx.params.id },
        include: { interaction: { select: { organizationId: true } } }
      });
      if (
        !suggestion ||
        (suggestion as { interaction?: { organizationId: string } }).interaction
          ?.organizationId !== orgCtx.organization.id
      ) {
        return sendJson(res, 404, { error: 'Not found' });
      }
      const action = String(body.action || '');
      if (action === 'approve') {
        await ctx.db.replySuggestion.update({
          where: { id: ctx.params.id },
          data: {
            status: 'approved',
            reviewedAt: new Date(),
            decision: body.finalText
              ? String(body.finalText)
              : suggestion.suggestedText
          }
        });
        sendJson(res, 200, { ok: true, status: 'approved' });
      } else if (action === 'reject') {
        await ctx.db.replySuggestion.update({
          where: { id: ctx.params.id },
          data: { status: 'rejected', reviewedAt: new Date() }
        });
        sendJson(res, 200, { ok: true, status: 'rejected' });
      } else {
        sendJson(res, 400, {
          error: {
            code: 'INVALID_ACTION',
            message: 'Action must be approve or reject'
          }
        });
      }
    }
  },

  // ── Interactions/Sync ──────────────────────────────────────────
  {
    method: 'POST',
    pattern: '/api/interactions/sync',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (isRateLimited(`sync:${orgCtx.organization.id}`, 20, 60_000))
        return sendJson(res, 429, { error: '同步操作过于频繁，请稍后再试' });
      const body = ctx.body as Record<string, unknown>;
      const platform = String(body.platform ?? '');
      const platformAccountId = String(body.platformAccountId ?? '');
      const syncType = String(body.syncType ?? 'all');
      const mode = String(body.mode ?? 'browser_assist');
      const headed = typeof body.headed === 'boolean' ? body.headed : undefined;
      const sourceContentId = body.sourceContentId as string | undefined;

      if (!platform || !platformAccountId) {
        return sendJson(res, 400, {
          error: 'platform 和 platformAccountId 必填'
        });
      }

      // Create InteractionSyncJob record
      const syncJob = await ctx.db.interactionSyncJob.create({
        data: {
          platform,
          platformAccountId,
          syncType,
          mode,
          status: 'queued'
        }
      });

      // Dispatch to worker queues via BullMQ
      const { Queue } = await import('bullmq');
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      const connection = { url: redisUrl };

      const commonPayload = {
        organizationId: orgCtx.organization.id,
        userId: orgCtx.user.id,
        platformAccountId,
        platform,
        mode,
        headed,
        syncJobId: syncJob.id
      };

      const queued: string[] = [];

      if (syncType === 'comments' || syncType === 'all') {
        const queue = new Queue('interaction.sync_comments', { connection });
        await queue.add(
          'sync-comments',
          { ...commonPayload, sourceContentId, limit: 50 },
          { attempts: 3, backoff: { type: 'exponential', delay: 10000 } }
        );
        queued.push('comments');
      }

      if (syncType === 'messages' || syncType === 'all') {
        const queue = new Queue('interaction.sync_messages', { connection });
        await queue.add(
          'sync-messages',
          { ...commonPayload, limit: 50 },
          { attempts: 3, backoff: { type: 'exponential', delay: 10000 } }
        );
        queued.push('messages');
      }

      sendJson(res, 202, {
        syncJobId: syncJob.id,
        status: 'queued',
        queued
      });
    }
  },

  // ── InteractionSyncJob status ────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/interactions/sync/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const job = await ctx.db.interactionSyncJob.findFirst({
        where: { id: ctx.params.id }
      });
      // Verify the sync job belongs to this org via its platform account
      if (job) {
        const account = await ctx.db.platformAccount.findFirst({
          where: {
            id: job.platformAccountId,
            organizationId: orgCtx.organization.id
          },
          select: { id: true }
        });
        if (!account)
          return sendJson(res, 404, { error: 'Sync job not found' });
      }
      if (!job) return sendJson(res, 404, { error: 'Sync job not found' });
      sendJson(res, 200, job);
    }
  },

  // ── Conversations ──────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/conversations/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const item = await ctx.db.conversation.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        },
        include: {
          interactions: {
            orderBy: { receivedAt: 'asc' },
            where: { deletedAt: null }
          }
        }
      });
      if (!item) return sendJson(res, 404, { error: 'Not found' });
      sendJson(res, 200, item);
    }
  },
  {
    method: 'GET',
    pattern: '/api/conversations',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const where: Record<string, unknown> = {
        organizationId: orgCtx.organization.id,
        deletedAt: null
      };
      const platform = ctx.url.searchParams.get('platform');
      if (platform) where.platform = platform;
      const items = await ctx.db.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          interactions: {
            where: { deletedAt: null },
            orderBy: { receivedAt: 'desc' }
          }
        }
      });
      sendJson(res, 200, items);
    }
  },

  // ── Leads ──────────────────────────────────────────────────────
  {
    method: 'POST',
    pattern: '/api/leads',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown>;
      const lead = await ctx.db.lead.create({
        data: {
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id,
          sourcePlatform: String(body.sourcePlatform ?? 'douyin') as 'douyin',
          sourceAccountId: String(body.sourceAccountId ?? ''),
          externalUserId: String(body.externalUserId ?? ''),
          externalUserName: String(body.externalUserName ?? ''),
          level: String(body.level ?? 'C') as 'C',
          status: 'NEW',
          intent: body.intent as string | undefined,
          summary: body.summary as string | undefined,
          tags: body.tags as never
        }
      });
      sendJson(res, 201, lead);
    }
  },
  {
    method: 'GET',
    pattern: '/api/leads',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const { page, pageSize } = parsePagination(ctx.url);
      const where: Record<string, unknown> = {
        organizationId: orgCtx.organization.id,
        deletedAt: null
      };
      const level = ctx.url.searchParams.get('level');
      if (level) where.level = level;
      const status = ctx.url.searchParams.get('status');
      if (status) where.status = status;
      const result = await paginate(
        ctx.db.lead,
        where,
        { page, pageSize },
        { createdAt: 'desc' },
        {
          leadActivities: { orderBy: { createdAt: 'desc' } },
          interaction: true,
          externalMappings: true,
          syncLogs: { orderBy: { attemptedAt: 'desc' }, take: 5 }
        }
      );
      sendJson(res, 200, result);
    }
  },
  {
    method: 'GET',
    pattern: '/api/leads/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const item = await ctx.db.lead.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        },
        include: {
          leadActivities: { orderBy: { createdAt: 'desc' } },
          interaction: true,
          externalMappings: true,
          syncLogs: { orderBy: { attemptedAt: 'desc' }, take: 5 }
        }
      });
      if (!item) return sendJson(res, 404, { error: 'Not found' });
      sendJson(res, 200, item);
    }
  },
  {
    method: 'PUT',
    pattern: '/api/leads/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const bodyResult = validateBody(updateLeadSchema, ctx.body);
      if (!bodyResult.success)
        return sendJson(res, 400, {
          error: '输入验证失败',
          errors: bodyResult.errors
        });
      const body = bodyResult.data as Record<string, unknown>;
      const lead = await ctx.db.lead.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!lead) return sendJson(res, 404, { error: 'Not found' });
      const item = await ctx.db.lead.update({
        where: { id: ctx.params.id },
        data: {
          ...(body.status != null && { status: String(body.status) as never }),
          ...(body.level != null && { level: String(body.level) as 'A' }),
          ...(body.assignedTo != null && {
            assignedTo: String(body.assignedTo)
          }),
          ...(body.nextAction != null && {
            nextAction: String(body.nextAction)
          }),
          ...(body.tags != null && { tags: body.tags })
        }
      });
      sendJson(res, 200, item);
    }
  },
  {
    method: 'PATCH',
    pattern: '/api/leads/:id/assign',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown>;
      const lead = await ctx.db.lead.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!lead) return sendJson(res, 404, { error: 'Not found' });
      const item = await ctx.db.lead.update({
        where: { id: ctx.params.id },
        data: { assignedTo: String(body.assignedTo ?? ''), status: 'ASSIGNED' }
      });
      await ctx.db.leadActivity.create({
        data: {
          leadId: ctx.params.id,
          action: 'assigned',
          note: `分配给 ${body.assignedTo ?? ''}`,
          operator: 'system'
        }
      });
      sendJson(res, 200, item);
    }
  },
  {
    method: 'GET',
    pattern: '/api/leads/:leadId/activities',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      // Verify the lead belongs to this org
      const lead = await ctx.db.lead.findFirst({
        where: {
          id: ctx.params.leadId,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        },
        select: { id: true }
      });
      if (!lead) return sendJson(res, 404, { error: 'Not found' });
      const items = await ctx.db.leadActivity.findMany({
        where: { leadId: ctx.params.leadId },
        orderBy: { createdAt: 'desc' }
      });
      sendJson(res, 200, items);
    }
  },
  {
    method: 'POST',
    pattern: '/api/leads/:id/sync-feishu',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const lead = await ctx.db.lead.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!lead) return sendJson(res, 404, { error: 'Not found' });

      const sinkConfig = await ctx.db.leadSinkConfig.findFirst({
        where: { organizationId: orgCtx.organization.id, sinkType: 'lark' }
      });
      const configObj = (sinkConfig?.config as Record<string, unknown>) || {};

      // Call real Feishu sink, fall back to stub on failure
      let result: {
        success: boolean;
        externalId?: string;
        externalUrl?: string;
        errorMessage?: string;
      };
      try {
        const { syncLeadToSink } = await import('@ai-growth-ops/lead-sinks');
        result = await syncLeadToSink(
          {
            id: lead.id,
            sourcePlatform: lead.sourcePlatform,
            externalUserName: lead.externalUserName || undefined,
            level: lead.level,
            intent: lead.intent || undefined,
            summary: lead.summary || undefined,
            confidence: lead.confidence || undefined,
            tags: lead.tags,
            assignedTo: lead.assignedTo || undefined,
            nextAction: lead.nextAction || undefined,
            riskLevel: lead.riskLevel || undefined,
            createdAt: lead.createdAt
          },
          'lark',
          {
            appId: configObj.appId as string,
            appSecret: configObj.appSecret as string,
            appToken: configObj.appToken as string,
            tableId: configObj.tableId as string,
            fieldMapping: configObj.fieldMapping as Record<string, string>
          }
        );
      } catch (syncErr) {
        result = {
          success: false,
          errorMessage: (syncErr as Error).message || '同步服务不可用'
        };
      }

      await ctx.db.leadExternalMapping.upsert({
        where: { leadId_sinkType: { leadId: lead.id, sinkType: 'lark' } },
        create: {
          leadId: lead.id,
          sinkType: 'lark',
          externalId: result.externalId || `lark-${lead.id.slice(0, 8)}`,
          externalUrl: result.externalUrl
        },
        update: {
          syncedAt: new Date(),
          externalId: result.externalId || undefined,
          externalUrl: result.externalUrl || undefined
        }
      });
      await ctx.db.leadSinkSyncLog.create({
        data: {
          leadId: lead.id,
          sinkType: 'lark',
          operation: 'upsert_lead',
          status: result.success ? 'success' : 'failed',
          error: result.errorMessage
        }
      });
      if (result.success) {
        await ctx.db.lead.update({
          where: { id: lead.id },
          data: { status: 'SYNCED' }
        });
      }
      sendJson(res, 200, {
        success: result.success,
        externalId: result.externalId,
        error: result.errorMessage
      });
    }
  },
  {
    method: 'POST',
    pattern: '/api/leads/:id/sync-wecom',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const lead = await ctx.db.lead.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!lead) return sendJson(res, 404, { error: 'Not found' });

      const sinkConfig = await ctx.db.leadSinkConfig.findFirst({
        where: { organizationId: orgCtx.organization.id, sinkType: 'wecom' }
      });
      const configObj = (sinkConfig?.config as Record<string, unknown>) || {};

      // Call real WeCom sink, fall back to stub on failure
      let result: {
        success: boolean;
        externalId?: string;
        externalUrl?: string;
        errorMessage?: string;
      };
      try {
        const { syncLeadToSink } = await import('@ai-growth-ops/lead-sinks');
        result = await syncLeadToSink(
          {
            id: lead.id,
            sourcePlatform: lead.sourcePlatform,
            externalUserName: lead.externalUserName || undefined,
            level: lead.level,
            intent: lead.intent || undefined,
            summary: lead.summary || undefined,
            confidence: lead.confidence || undefined,
            tags: lead.tags,
            assignedTo: lead.assignedTo || undefined,
            nextAction: lead.nextAction || undefined,
            riskLevel: lead.riskLevel || undefined,
            createdAt: lead.createdAt
          },
          'wecom',
          {
            corpId: configObj.corpId as string,
            secret: configObj.secret as string,
            agentId: configObj.agentId as string
          }
        );
      } catch (syncErr) {
        result = {
          success: false,
          errorMessage: (syncErr as Error).message || '同步服务不可用'
        };
      }

      await ctx.db.leadExternalMapping.upsert({
        where: { leadId_sinkType: { leadId: lead.id, sinkType: 'wecom' } },
        create: {
          leadId: lead.id,
          sinkType: 'wecom',
          externalId: result.externalId || `wecom-${lead.id.slice(0, 8)}`
        },
        update: {
          syncedAt: new Date(),
          externalId: result.externalId || undefined
        }
      });
      await ctx.db.leadSinkSyncLog.create({
        data: {
          leadId: lead.id,
          sinkType: 'wecom',
          operation: 'upsert_lead',
          status: result.success ? 'success' : 'failed',
          error: result.errorMessage
        }
      });
      if (result.success) {
        await ctx.db.lead.update({
          where: { id: lead.id },
          data: { status: 'SYNCED' }
        });
      }
      sendJson(res, 200, {
        success: result.success,
        externalId: result.externalId,
        error: result.errorMessage
      });
    }
  },

  // ── Analytics ──────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/analytics/overview',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const dashboard = await getCustomerDashboard(ctx.db, orgCtx.user.id);
      sendJson(res, 200, {
        totalPublished: dashboard.metrics.publishedJobs,
        totalInteractions: dashboard.metrics.interactions,
        totalLeads: dashboard.metrics.qualifiedLeads,
        totalResearchInsights: dashboard.metrics.researchInsights,
        totalContentItems: dashboard.metrics.contentItems,
        totalPublishJobs: dashboard.metrics.publishJobs,
        platformAccounts: dashboard.metrics.platformAccounts,
        contentVariants: dashboard.metrics.contentVariants,
        contentOpportunities: dashboard.metrics.contentOpportunities,
        providerRuns: dashboard.metrics.providerRuns
      });
    }
  },
  {
    method: 'GET',
    pattern: '/api/analytics/platforms',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const jobs = await ctx.db.publishJob.groupBy({
        by: ['platform'],
        where: { organizationId: orgCtx.organization.id, deletedAt: null },
        _count: { id: true }
      });
      const leads = await ctx.db.lead.groupBy({
        by: ['sourcePlatform'],
        where: { organizationId: orgCtx.organization.id, deletedAt: null },
        _count: { id: true }
      });
      const platformLabels: Record<string, string> = {
        douyin: '抖音',
        xiaohongshu: '小红书',
        wechat_official: '微信公众号',
        wechat_channels: '微信视频号',
        baijiahao: '百家号',
        zhihu: '知乎'
      };
      const allPlatforms = [
        'douyin',
        'xiaohongshu',
        'wechat_official',
        'wechat_channels',
        'baijiahao',
        'zhihu'
      ];
      const result = allPlatforms.map((p) => {
        const jobGroup = jobs.find((j) => j.platform === p);
        const leadGroup = leads.find((l) => l.sourcePlatform === p);
        return {
          platform: p,
          platformLabel: platformLabels[p],
          publishCount: jobGroup?._count.id ?? 0,
          leadCount: leadGroup?._count.id ?? 0
        };
      });
      sendJson(res, 200, result);
    }
  },
  {
    method: 'GET',
    pattern: '/api/analytics/content-roi',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const items = await ctx.db.contentItem.findMany({
        where: { organizationId: orgCtx.organization.id, deletedAt: null },
        include: {
          contentVariants: {
            include: { publishJobs: { where: { deletedAt: null } } }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      });
      const result = items.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        variantCount: item.contentVariants.length,
        publishCount: item.contentVariants.reduce(
          (sum, v) => sum + v.publishJobs.length,
          0
        ),
        publishedCount: item.contentVariants.reduce(
          (sum, v) =>
            sum + v.publishJobs.filter((j) => j.status === 'PUBLISHED').length,
          0
        )
      }));
      sendJson(res, 200, result);
    }
  },
  {
    method: 'GET',
    pattern: '/api/analytics/leads/trend',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const leads = await ctx.db.lead.findMany({
        where: { organizationId: orgCtx.organization.id, deletedAt: null },
        select: { createdAt: true, level: true }
      });
      const result = aggregateByDate(leads, 'createdAt');
      sendJson(res, 200, result);
    }
  },
  {
    method: 'GET',
    pattern: '/api/analytics/platforms/trend',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const jobs = await ctx.db.publishJob.findMany({
        where: { organizationId: orgCtx.organization.id, deletedAt: null },
        select: { createdAt: true, platform: true }
      });
      const result = aggregateByDate(jobs, 'createdAt', 'platform');
      sendJson(res, 200, result);
    }
  },

  // ── Legacy research/run ────────────────────────────────────────
  {
    method: 'POST',
    pattern: '/api/research/run',
    handler: async (_req, res, _ctx) => {
      sendJson(res, 410, {
        error: 'Legacy research run endpoint is deprecated'
      });
    }
  },

  // ── Platform Accounts ──────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/accounts',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const items = await ctx.db.platformAccount.findMany({
        where: { organizationId: orgCtx.organization.id, deletedAt: null },
        include: { platformCapabilities: { where: { deletedAt: null } } },
        orderBy: { platform: 'asc' }
      });
      sendJson(res, 200, items);
    }
  },
  {
    method: 'POST',
    pattern: '/api/accounts',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown>;
      const platform = String(body.platform ?? '');
      const name = String(body.name ?? '');
      const mode = String(body.mode ?? 'official_api');
      const authType = body.authType ? String(body.authType) : null;

      const validPlatforms = [
        'douyin',
        'xiaohongshu',
        'wechat_official',
        'wechat_channels',
        'baijiahao',
        'zhihu'
      ];
      if (!validPlatforms.includes(platform))
        return sendJson(res, 400, { error: 'Invalid platform' });
      if (!name) return sendJson(res, 400, { error: 'Name is required' });

      // Encrypt credentials if provided
      const encryptedAccess = body.accessToken
        ? encryptToken(String(body.accessToken))
        : null;
      const encryptedRefresh = body.refreshToken
        ? encryptToken(String(body.refreshToken))
        : null;
      const cookieRef = body.cookie ? encryptToken(String(body.cookie)) : null;

      const account = await ctx.db.platformAccount.create({
        data: {
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id,
          platform: platform as 'douyin',
          name,
          mode: mode as 'official_api',
          status: 'active',
          authType,
          accessTokenEncrypted: encryptedAccess,
          refreshTokenEncrypted: encryptedRefresh,
          cookieRef,
          capabilities: body.capabilities ?? {},
          metadata: { source: 'manual_create' }
        }
      });

      // Create default capabilities
      const defaultCaps = [
        'text_image_publish',
        'video_publish',
        'comment_sync',
        'comment_reply'
      ];
      for (const capKey of defaultCaps) {
        await ctx.db.platformCapability.create({
          data: {
            organizationId: orgCtx.organization.id,
            userId: orgCtx.user.id,
            platformAccountId: account.id,
            platform: platform as 'douyin',
            capabilityKey: capKey,
            mode: mode as 'official_api',
            enabled: true
          }
        });
      }

      const result = await ctx.db.platformAccount.findFirst({
        where: { id: account.id },
        include: { platformCapabilities: { where: { deletedAt: null } } }
      });
      sendJson(res, 201, result);
    }
  },
  {
    method: 'PUT',
    pattern: '/api/accounts/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown>;
      const account = await ctx.db.platformAccount.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!account) return sendJson(res, 404, { error: 'Not found' });

      const data: Record<string, unknown> = {};
      if (body.status != null) data.status = String(body.status);
      if (body.name != null) data.name = String(body.name);
      if (body.mode != null) data.mode = String(body.mode);
      if (body.authType != null)
        data.authType = body.authType ? String(body.authType) : null;
      if (body.metadata != null) data.metadata = body.metadata;
      if (body.accessToken != null)
        data.accessTokenEncrypted = String(body.accessToken)
          ? encryptToken(String(body.accessToken))
          : null;
      if (body.refreshToken != null)
        data.refreshTokenEncrypted = String(body.refreshToken)
          ? encryptToken(String(body.refreshToken))
          : null;
      if (body.cookie != null)
        data.cookieRef = String(body.cookie)
          ? encryptToken(String(body.cookie))
          : null;

      await ctx.db.platformAccount.update({
        where: { id: ctx.params.id },
        data
      });

      // Update capability enabled flags if provided
      if (Array.isArray(body.capabilities)) {
        for (const cap of body.capabilities as Array<Record<string, unknown>>) {
          if (cap.id && cap.enabled != null) {
            await ctx.db.platformCapability.update({
              where: { id: String(cap.id) },
              data: { enabled: Boolean(cap.enabled) }
            });
          }
        }
      }

      const result = await ctx.db.platformAccount.findFirst({
        where: { id: ctx.params.id },
        include: { platformCapabilities: { where: { deletedAt: null } } }
      });
      sendJson(res, 200, result);
    }
  },
  {
    method: 'POST',
    pattern: '/api/accounts/:id/validate',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const account = await ctx.db.platformAccount.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!account) return sendJson(res, 404, { error: 'Not found' });

      try {
        const provider = getPlatformProvider(account.platform);
        const config = {
          authType: (account.authType ?? 'manual') as 'official_api',
          accessToken: account.accessTokenEncrypted
            ? decryptToken(account.accessTokenEncrypted)
            : undefined,
          refreshToken: account.refreshTokenEncrypted
            ? decryptToken(account.refreshTokenEncrypted)
            : undefined,
          cookie: account.cookieRef
            ? decryptToken(account.cookieRef)
            : undefined,
          appId: (account.metadata as Record<string, unknown>)?.appId as
            | string
            | undefined,
          appSecret: (account.metadata as Record<string, unknown>)
            ?.appSecret as string | undefined
        };
        const result = await provider.validateCredentials(config);

        await ctx.db.platformAccount.update({
          where: { id: account.id },
          data: {
            lastHealthCheckAt: new Date(),
            ...(result.valid ? { status: 'active' } : { status: 'error' })
          }
        });

        sendJson(res, 200, { ...result, checkedAt: new Date().toISOString() });
      } catch (err) {
        await ctx.db.platformAccount.update({
          where: { id: account.id },
          data: { lastHealthCheckAt: new Date(), status: 'error' }
        });
        sendJson(res, 200, {
          valid: false,
          platform: account.platform,
          error: (err as Error).message,
          checkedAt: new Date().toISOString()
        });
      }
    }
  },
  {
    method: 'DELETE',
    pattern: '/api/accounts/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const account = await ctx.db.platformAccount.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!account) return sendJson(res, 404, { error: 'Not found' });
      await ctx.db.platformAccount.update({
        where: { id: ctx.params.id },
        data: { deletedAt: new Date() }
      });
      sendJson(res, 200, { deleted: true });
    }
  },

  // ── Browser Login (browser_assist mode) ────────────────────────
  {
    method: 'POST',
    pattern: '/api/accounts/:id/browser-login/start',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const account = await ctx.db.platformAccount.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id,
          deletedAt: null
        }
      });
      if (!account) return sendJson(res, 404, { error: 'Not found' });

      if (!markPending(account.id)) {
        return sendJson(res, 409, {
          status: 'error',
          error: '登录会话正在创建中，请稍候'
        });
      }

      const runnerUrl = getBrowserRunnerUrl();
      try {
        const existingSessionId = getSessionId(account.id);
        if (existingSessionId) {
          try {
            await fetchWithTimeout(
              `${runnerUrl}/session/${existingSessionId}/cancel`,
              { method: 'POST', headers: runnerHeaders() },
              5_000
            );
          } catch {
            /* cancel old session best-effort */
          }
          clearSession(account.id);
        }
        const startRes = await fetchWithTimeout(`${runnerUrl}/session/start`, {
          method: 'POST',
          headers: runnerHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({ platform: account.platform })
        });
        if (!startRes.ok) {
          const err = (await startRes
            .json()
            .catch(() => ({ error: 'browser-runner error' }))) as {
            error?: string;
          };
          return sendJson(res, 502, {
            status: 'error',
            error: err.error ?? '浏览器辅助服务错误'
          });
        }
        const data = (await startRes.json()) as { sessionId: string };
        setSession(account.id, data.sessionId);
        clearPending(account.id);
        sendJson(res, 200, {
          sessionId: data.sessionId,
          status: 'waiting_scan'
        });
      } catch (err) {
        const msg = (err as Error).message || '';
        const cause = (err as Error).cause as
          | { message?: string; code?: string }
          | undefined;
        const causeMsg = cause?.message || cause?.code || '';
        const detail = causeMsg || msg || 'unknown error';
        const hint = msg.includes('abort')
          ? '连接超时，请确认浏览器辅助服务是否已启动'
          : '服务未启动或不可达';
        sendJson(res, 502, {
          status: 'error',
          error: `浏览器辅助服务不可用: ${hint} (${runnerUrl} — ${detail})`
        });
      } finally {
        clearPending(account.id);
      }
    }
  },
  {
    method: 'GET',
    pattern: '/api/accounts/:id/browser-login/status',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const accountId = ctx.params.id;
      const sessionId = getSessionId(accountId);
      if (!sessionId) {
        return sendJson(res, 200, {
          status: 'error',
          error: '登录会话不存在，请关闭后重新扫码'
        });
      }

      try {
        const runnerUrl = getBrowserRunnerUrl();
        const statusRes = await fetchWithTimeout(
          `${runnerUrl}/session/${sessionId}/status`,
          { method: 'GET', headers: runnerHeaders() },
          10_000
        );
        if (!statusRes.ok) {
          return sendJson(res, 200, {
            status: 'error',
            error: 'browser-runner 返回错误'
          });
        }
        const data = (await statusRes.json()) as {
          status: string;
          cookies?: string;
          error?: string;
        };

        if (data.status === 'logged_in') {
          if (!data.cookies?.trim()) {
            sendJson(res, 200, {
              status: 'error',
              error: '登录成功但未获取到 Cookie，请完成扫码后稍等或重试'
            });
            return;
          }
          const encrypted = encryptToken(data.cookies);
          await ctx.db.platformAccount.update({
            where: { id: accountId },
            data: {
              cookieRef: encrypted,
              authType: 'cookie',
              mode: 'browser_assist',
              status: 'active',
              lastHealthCheckAt: new Date()
            }
          });
          clearSession(accountId);
        } else if (data.status === 'expired' || data.status === 'error') {
          clearSession(accountId);
        }

        // Strip plaintext cookies before sending to frontend
        const { cookies: _rawCookies, ...safeData } = data;
        sendJson(res, 200, safeData);
      } catch (err) {
        sendJson(res, 200, { status: 'error', error: (err as Error).message });
      }
    }
  },
  {
    method: 'POST',
    pattern: '/api/accounts/:id/browser-login/cancel',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const accountId = ctx.params.id;
      const sessionId = getSessionId(accountId);
      if (sessionId) {
        try {
          const runnerUrl = getBrowserRunnerUrl();
          await fetchWithTimeout(
            `${runnerUrl}/session/${sessionId}/cancel`,
            { method: 'POST', headers: runnerHeaders() },
            5_000
          );
        } catch {
          /* cancel best-effort */
        }
        clearSession(accountId);
      }
      sendJson(res, 200, { ok: true });
    }
  },

  // ── Providers (from provider run logs) ─────────────────────────
  {
    method: 'GET',
    pattern: '/api/providers',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const logs = await ctx.db.providerRunLog.groupBy({
        by: ['providerName', 'operation'],
        _count: { id: true },
        _avg: { durationMs: true },
        where: { status: 'success' }
      });
      const result = logs.map((log) => ({
        name: log.providerName,
        operation: log.operation,
        runCount: log._count.id,
        avgDurationMs: Math.round(log._avg.durationMs ?? 0)
      }));
      sendJson(res, 200, result);
    }
  },

  // ── Lead Sink Configs (Feishu / WeCom) ─────────────────────────
  {
    method: 'GET',
    pattern: '/api/lead-sinks/feishu',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const config = await ctx.db.leadSinkConfig.findFirst({
        where: { organizationId: orgCtx.organization.id, sinkType: 'lark' }
      });
      if (!config) return sendJson(res, 200, { enabled: false });
      sendJson(res, 200, {
        id: config.id,
        appId: (config.config as Record<string, unknown>)?.appId ?? '',
        appToken: (config.config as Record<string, unknown>)?.appToken ?? '',
        tableId: (config.config as Record<string, unknown>)?.tableId ?? '',
        enabled: config.enabled,
        lastSyncAt: config.updatedAt
      });
    }
  },
  {
    method: 'PUT',
    pattern: '/api/lead-sinks/feishu',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown>;
      const existing = await ctx.db.leadSinkConfig.findFirst({
        where: { organizationId: orgCtx.organization.id, sinkType: 'lark' }
      });
      if (existing) {
        const updated = await ctx.db.leadSinkConfig.update({
          where: { id: existing.id },
          data: {
            config: body as never,
            enabled:
              body.enabled != null ? Boolean(body.enabled) : existing.enabled
          }
        });
        sendJson(res, 200, updated);
      } else {
        const created = await ctx.db.leadSinkConfig.create({
          data: {
            organizationId: orgCtx.organization.id,
            userId: orgCtx.user.id,
            sinkType: 'lark',
            config: body as never,
            enabled: body.enabled != null ? Boolean(body.enabled) : true
          }
        });
        sendJson(res, 201, created);
      }
    }
  },
  {
    method: 'GET',
    pattern: '/api/lead-sinks/wecom',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const config = await ctx.db.leadSinkConfig.findFirst({
        where: { organizationId: orgCtx.organization.id, sinkType: 'wecom' }
      });
      if (!config) return sendJson(res, 200, { enabled: false });
      sendJson(res, 200, {
        id: config.id,
        corpId: (config.config as Record<string, unknown>)?.corpId ?? '',
        agentId: (config.config as Record<string, unknown>)?.agentId ?? '',
        enabled: config.enabled,
        lastSyncAt: config.updatedAt
      });
    }
  },
  {
    method: 'PUT',
    pattern: '/api/lead-sinks/wecom',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown>;
      const existing = await ctx.db.leadSinkConfig.findFirst({
        where: { organizationId: orgCtx.organization.id, sinkType: 'wecom' }
      });
      if (existing) {
        const updated = await ctx.db.leadSinkConfig.update({
          where: { id: existing.id },
          data: {
            config: body as never,
            enabled:
              body.enabled != null ? Boolean(body.enabled) : existing.enabled
          }
        });
        sendJson(res, 200, updated);
      } else {
        const created = await ctx.db.leadSinkConfig.create({
          data: {
            organizationId: orgCtx.organization.id,
            userId: orgCtx.user.id,
            sinkType: 'wecom',
            config: body as never,
            enabled: body.enabled != null ? Boolean(body.enabled) : true
          }
        });
        sendJson(res, 201, created);
      }
    }
  },

  // ── Settings: AI ───────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/settings/ai',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const recentRuns = await ctx.db.skillRun.findMany({
        where: { organizationId: orgCtx.organization.id },
        orderBy: { createdAt: 'desc' },
        take: 1
      });

      // Load saved config from database, fallback to env vars
      const savedConfig = await ctx.db.appConfig.findUnique({
        where: { userId_key: { userId: orgCtx.user.id, key: 'ai_config' } }
      });
      const saved = savedConfig?.value as Record<string, unknown> | null;

      sendJson(res, 200, {
        provider:
          (saved?.provider as string) ?? process.env.AI_PROVIDER ?? 'openai',
        baseUrl: (saved?.baseUrl as string) ?? process.env.AI_BASE_URL ?? '',
        model: (saved?.model as string) ?? process.env.AI_MODEL ?? 'gpt-4o',
        temperature:
          (saved?.temperature as number) ??
          Number(process.env.AI_TEMPERATURE ?? 0.7),
        maxTokens:
          (saved?.maxTokens as number) ??
          Number(process.env.AI_MAX_TOKENS ?? 4096),
        dailyTokenLimit:
          (saved?.dailyTokenLimit as number) ??
          Number(process.env.AI_DAILY_TOKEN_LIMIT ?? 100000),
        features: {
          textGeneration: true,
          leadIdentification: true,
          replySuggestion: true
        },
        lastRunAt: recentRuns[0]?.createdAt ?? null,
        mediaGeneration: {
          mode:
            ((saved?.mediaGeneration as Record<string, unknown>)
              ?.mode as string) ??
            process.env.MEDIA_GEN_MODE ??
            'llm_provider',
          provider:
            ((saved?.mediaGeneration as Record<string, unknown>)
              ?.provider as string) ??
            process.env.MEDIA_GEN_PROVIDER ??
            'openai',
          apiKey: process.env.MEDIA_GEN_API_KEY ? '••••••••' : '',
          baseUrl:
            ((saved?.mediaGeneration as Record<string, unknown>)
              ?.baseUrl as string) ??
            process.env.MEDIA_GEN_BASE_URL ??
            '',
          model:
            ((saved?.mediaGeneration as Record<string, unknown>)
              ?.model as string) ??
            process.env.MEDIA_GEN_MODEL ??
            'dall-e-3'
        }
      });
    }
  },
  // Internal endpoint: returns the actual apiKey for server-side use (chat route).
  // Not exposed to the browser — only called from the Next.js server.
  {
    method: 'GET',
    pattern: '/api/settings/ai/internal',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });

      const savedConfig = await ctx.db.appConfig.findUnique({
        where: { userId_key: { userId: orgCtx.user.id, key: 'ai_config' } }
      });
      const saved = savedConfig?.value as Record<string, unknown> | null;

      sendJson(res, 200, {
        provider:
          (saved?.provider as string) ?? process.env.AI_PROVIDER ?? 'openai',
        apiKey:
          (saved?.apiKey as string) ?? process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY ?? '',
        baseUrl:
          (saved?.baseUrl as string) ?? process.env.AI_BASE_URL ?? '',
        model:
          (saved?.model as string) ?? process.env.AI_MODEL ?? 'gpt-4o'
      });
    }
  },
  {
    method: 'PUT',
    pattern: '/api/settings/ai',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'settings:manage')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const body = ctx.body as Record<string, unknown> | null;
      if (!body) return sendJson(res, 400, { error: '请求体为空' });

      const configValue = {
        provider: body.provider ?? process.env.AI_PROVIDER ?? 'openai',
        baseUrl: body.baseUrl ?? process.env.AI_BASE_URL ?? '',
        model: body.model ?? process.env.AI_MODEL ?? 'gpt-4o',
        temperature:
          body.temperature ?? Number(process.env.AI_TEMPERATURE ?? 0.7),
        maxTokens: body.maxTokens ?? Number(process.env.AI_MAX_TOKENS ?? 4096),
        dailyTokenLimit:
          body.dailyTokenLimit ??
          Number(process.env.AI_DAILY_TOKEN_LIMIT ?? 100000),
        mediaGeneration: body.mediaGeneration ?? {
          mode: process.env.MEDIA_GEN_MODE ?? 'llm_provider',
          provider: process.env.MEDIA_GEN_PROVIDER ?? 'openai',
          model: process.env.MEDIA_GEN_MODEL ?? 'dall-e-3'
        }
      };

      await ctx.db.appConfig.upsert({
        where: { userId_key: { userId: orgCtx.user.id, key: 'ai_config' } },
        create: {
          userId: orgCtx.user.id,
          organizationId: orgCtx.organization.id,
          key: 'ai_config',
          value: configValue as never
        },
        update: { value: configValue as never }
      });

      sendJson(res, 200, { ok: true, updated: true });
    }
  },

  // ── Settings: Skills ───────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/skills',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const runs = await ctx.db.skillRun.findMany({
        where: { organizationId: orgCtx.organization.id },
        orderBy: { createdAt: 'desc' }
      });
      const grouped = new Map<string, typeof runs>();
      for (const run of runs) {
        const existing = grouped.get(run.skillName) ?? [];
        existing.push(run);
        grouped.set(run.skillName, existing);
      }
      const result = Array.from(grouped.entries()).map(([name, items]) => ({
        name,
        lastRunAt: items[0]?.createdAt ?? null,
        status: items[0]?.status ?? 'pending',
        successRate:
          items.length > 0
            ? items.filter((i) => i.status === 'success').length / items.length
            : 0,
        avgLatencyMs:
          items.length > 0
            ? Math.round(
                items.reduce((s, i) => s + (i.latencyMs ?? 0), 0) / items.length
              )
            : 0,
        totalRuns: items.length
      }));
      sendJson(res, 200, result);
    }
  },

  // ── Settings: Compliance ───────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/settings/compliance',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });

      const savedConfig = await ctx.db.appConfig.findUnique({
        where: {
          userId_key: { userId: orgCtx.user.id, key: 'compliance_config' }
        }
      });

      if (savedConfig?.value) {
        sendJson(res, 200, savedConfig.value);
      } else {
        // Default values when no saved config exists
        sendJson(res, 200, {
          sensitiveWords: ['最', '第一', '绝对', '保证'],
          forbiddenPhrases: ['包过', '必赚'],
          autoReplyLimits: { maxDailyReplies: 50, confidenceThreshold: 0.7 },
          humanConfirmRules: [
            { action: 'publish_first_time', threshold: 0.7 },
            { action: 'reply_high_risk', threshold: 0.5 },
            { action: 'lead_a_level_export', threshold: 0.8 },
            { action: 'media_publish_unreviewed', threshold: 1.0 }
          ]
        });
      }
    }
  },
  {
    method: 'PUT',
    pattern: '/api/settings/compliance',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'settings:manage')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const body = ctx.body as Record<string, unknown> | null;
      if (!body) return sendJson(res, 400, { error: '请求体为空' });

      await ctx.db.appConfig.upsert({
        where: {
          userId_key: { userId: orgCtx.user.id, key: 'compliance_config' }
        },
        create: {
          userId: orgCtx.user.id,
          organizationId: orgCtx.organization.id,
          key: 'compliance_config',
          value: body as never
        },
        update: { value: body as never }
      });

      sendJson(res, 200, { ok: true, updated: true });
    }
  },

  // ── Settings: Auto-Reply ──────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/settings/auto-reply',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });

      const savedConfig = await ctx.db.appConfig.findUnique({
        where: {
          userId_key: { userId: orgCtx.user.id, key: 'auto_reply_config' }
        }
      });

      if (savedConfig?.value) {
        sendJson(res, 200, savedConfig.value);
      } else {
        sendJson(res, 200, {
          enabled: false,
          maxDailyAutoReplies: 50,
          confidenceThreshold: 0.85,
          allowedReplyTypes: ['thanks', 'faq_answer', 'ask_more_info'],
          requireReviewForLevel: ['A'],
          maxRepliesPerUser: 3,
          quietHoursStart: '22:00',
          quietHoursEnd: '08:00'
        });
      }
    }
  },
  {
    method: 'PUT',
    pattern: '/api/settings/auto-reply',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'settings:manage')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const body = ctx.body as Record<string, unknown> | null;
      if (!body) return sendJson(res, 400, { error: '请求体为空' });

      await ctx.db.appConfig.upsert({
        where: {
          userId_key: { userId: orgCtx.user.id, key: 'auto_reply_config' }
        },
        create: {
          userId: orgCtx.user.id,
          organizationId: orgCtx.organization.id,
          key: 'auto_reply_config',
          value: body as never
        },
        update: { value: body as never }
      });

      sendJson(res, 200, { ok: true, updated: true });
    }
  },

  // ── Settings: Storage ─────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/settings/storage',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const saved = await ctx.db.appConfig.findUnique({
        where: { userId_key: { userId: orgCtx.user.id, key: 'storage_config' } }
      });
      if (saved?.value) {
        sendJson(res, 200, saved.value);
      } else {
        sendJson(res, 200, {
          storageType: 'local',
          path: './uploads',
          maxSize: 50,
          endpoint: '',
          bucket: ''
        });
      }
    }
  },
  {
    method: 'PUT',
    pattern: '/api/settings/storage',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'settings:manage')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const body = ctx.body as Record<string, unknown> | null;
      if (!body) return sendJson(res, 400, { error: '请求体为空' });
      await ctx.db.appConfig.upsert({
        where: {
          userId_key: { userId: orgCtx.user.id, key: 'storage_config' }
        },
        create: {
          userId: orgCtx.user.id,
          organizationId: orgCtx.organization.id,
          key: 'storage_config',
          value: body as never
        },
        update: { value: body as never }
      });
      sendJson(res, 200, { ok: true, updated: true });
    }
  },

  // ── User Profile ──────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/user/profile',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      sendJson(res, 200, {
        id: orgCtx.user.id,
        name: orgCtx.user.name,
        email: orgCtx.user.email,
        role: orgCtx.user.role,
        createdAt: orgCtx.user.createdAt
      });
    }
  },
  {
    method: 'PUT',
    pattern: '/api/user/profile',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown> | null;
      if (!body) return sendJson(res, 400, { error: '请求体为空' });
      const updated = await ctx.db.user.update({
        where: { id: orgCtx.user.id },
        data: {
          name: typeof body.name === 'string' ? body.name : undefined,
          email: typeof body.email === 'string' ? body.email : undefined
        }
      });
      sendJson(res, 200, {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        createdAt: updated.createdAt
      });
    }
  },

  // ── Team Management ───────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/team/members',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const members = await ctx.db.user.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true
        },
        orderBy: { createdAt: 'asc' }
      });
      sendJson(res, 200, members);
    }
  },
  {
    method: 'POST',
    pattern: '/api/team/invite',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'team:manage')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const body = ctx.body as Record<string, unknown> | null;
      if (!body?.email) return sendJson(res, 400, { error: '邮箱必填' });
      const existing = await ctx.db.user.findUnique({
        where: { email: body.email as string }
      });
      if (existing) return sendJson(res, 409, { error: '该邮箱已存在' });
      const role =
        body.role === 'admin' ||
        body.role === 'operator' ||
        body.role === 'viewer'
          ? body.role
          : 'operator';
      const member = await ctx.db.user.create({
        data: {
          email: body.email as string,
          name: (body.name as string) || (body.email as string).split('@')[0],
          role: role as string,
          passwordHash: hashPassword(randomBytes(16).toString('hex')) // random temp password
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true
        }
      });
      sendJson(res, 201, member);
    }
  },
  {
    method: 'PATCH',
    pattern: '/api/team/members/:id/role',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'team:manage')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const targetId = (ctx.params as Record<string, string>)?.id;
      if (!targetId) return sendJson(res, 400, { error: '缺少成员 ID' });
      const body = ctx.body as Record<string, unknown> | null;
      if (!body?.role) return sendJson(res, 400, { error: '角色必填' });
      const role = body.role as string;
      if (!['admin', 'operator', 'viewer'].includes(role))
        return sendJson(res, 400, { error: '无效角色' });
      const updated = await ctx.db.user.update({
        where: { id: targetId },
        data: { role },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true
        }
      });
      sendJson(res, 200, updated);
    }
  },
  {
    method: 'DELETE',
    pattern: '/api/team/members/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'team:manage')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const targetId = (ctx.params as Record<string, string>)?.id;
      if (!targetId) return sendJson(res, 400, { error: '缺少成员 ID' });
      if (targetId === orgCtx.user.id)
        return sendJson(res, 400, { error: '不能删除自己' });
      await ctx.db.user.update({
        where: { id: targetId },
        data: { deletedAt: new Date() }
      });
      sendJson(res, 200, { ok: true });
    }
  },

  // ── Webhooks ──────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/webhooks',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const webhooks = await ctx.db.appConfig.findMany({
        where: {
          organizationId: orgCtx.organization.id,
          key: { startsWith: 'webhook_' }
        },
        orderBy: { createdAt: 'desc' }
      });
      sendJson(
        res,
        200,
        webhooks.map((w) => ({
          id: w.id,
          ...(w.value as Record<string, unknown>),
          createdAt: w.createdAt
        }))
      );
    }
  },
  {
    method: 'POST',
    pattern: '/api/webhooks',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'webhook:manage')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const body = ctx.body as Record<string, unknown> | null;
      if (!body?.url || !(body.events as string[])?.length) {
        return sendJson(res, 400, { error: 'URL 和事件类型必填' });
      }
      const webhookId = `webhook_${Date.now()}`;
      const value = { url: body.url, events: body.events, status: 'active' };
      const created = await ctx.db.appConfig.create({
        data: {
          userId: orgCtx.user.id,
          organizationId: orgCtx.organization.id,
          key: webhookId,
          value: value as never
        }
      });
      sendJson(res, 201, {
        id: created.id,
        ...value,
        createdAt: created.createdAt
      });
    }
  },
  {
    method: 'DELETE',
    pattern: '/api/webhooks/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'webhook:manage')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const targetId = (ctx.params as Record<string, string>)?.id;
      if (!targetId) return sendJson(res, 400, { error: '缺少 Webhook ID' });
      const existing = await ctx.db.appConfig.findFirst({
        where: {
          id: targetId,
          organizationId: orgCtx.organization.id,
          key: { startsWith: 'webhook_' }
        }
      });
      if (!existing) return sendJson(res, 404, { error: 'Webhook 不存在' });
      await ctx.db.appConfig.delete({ where: { id: targetId } });
      sendJson(res, 200, { ok: true });
    }
  },

  // ── Analytics: Engagement ──────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/analytics/engagement',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const days = Math.min(
        90,
        Math.max(1, Number(ctx.url.searchParams.get('days')) || 7)
      );
      const { aggregateEngagementMetrics } =
        await import('./services/engagement-analytics.js');
      const metrics = await aggregateEngagementMetrics(
        ctx.db,
        orgCtx.organization.id,
        days
      );
      sendJson(res, 200, metrics);
    }
  },
  {
    method: 'GET',
    pattern: '/api/analytics/content-performance',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const days = Math.min(
        90,
        Math.max(1, Number(ctx.url.searchParams.get('days')) || 30)
      );
      const { computeContentPerformance } =
        await import('./services/engagement-analytics.js');
      const performance = await computeContentPerformance(
        ctx.db,
        orgCtx.organization.id,
        days
      );
      sendJson(res, 200, { items: performance });
    }
  },

  // ── Analytics: Reports ────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/analytics/reports',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const reports = await ctx.db.appConfig.findMany({
        where: {
          organizationId: orgCtx.organization.id,
          key: { startsWith: 'report_' }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      });
      sendJson(
        res,
        200,
        reports.map((r) => ({
          id: r.id,
          ...(r.value as Record<string, unknown>),
          createdAt: r.createdAt
        }))
      );
    }
  },
  {
    method: 'POST',
    pattern: '/api/analytics/reports/generate',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown> | null;
      if (!body?.type) return sendJson(res, 400, { error: '报告类型必填' });

      // Aggregate data from all modules for the report
      const [publishJobs, interactions, leads, contentItems] =
        await Promise.all([
          ctx.db.publishJob.count({
            where: {
              organizationId: orgCtx.organization.id,
              status: 'PUBLISHED'
            }
          }),
          ctx.db.interaction.count({
            where: { organizationId: orgCtx.organization.id }
          }),
          ctx.db.lead.count({
            where: { organizationId: orgCtx.organization.id }
          }),
          ctx.db.contentItem.count({
            where: { organizationId: orgCtx.organization.id }
          })
        ]);

      const typeLabels: Record<string, string> = {
        daily: '日报',
        weekly: '周报',
        monthly: '月报',
        content: '内容复盘报告',
        lead: '线索复盘报告',
        platform: '平台复盘报告'
      };

      const summary = `发布 ${publishJobs} 篇，互动 ${interactions} 次，合格线索 ${leads} 条，内容 ${contentItems} 项。`;
      const reportValue = {
        type: body.type,
        label: typeLabels[body.type as string] ?? '报告',
        summary,
        generatedAt: new Date().toISOString()
      };

      const reportId = `report_${Date.now()}`;
      const created = await ctx.db.appConfig.create({
        data: {
          userId: orgCtx.user.id,
          organizationId: orgCtx.organization.id,
          key: reportId,
          value: reportValue as never
        }
      });
      sendJson(res, 201, {
        id: created.id,
        ...reportValue,
        createdAt: created.createdAt
      });
    }
  },

  // Task Center routes
  ...taskRoutes,

  // Notification routes
  ...notificationRoutes,

  // Audit routes
  ...auditRoutes,

  // Analytics event routes
  ...analyticsRoutes,

  // Auth routes (register, verify-email, forgot-password, reset-password, etc.)
  ...authRoutes,

  // Organization routes (CRUD, members, invitations)
  ...orgRoutes,

  // ── CSV Export endpoints ─────────────────────────────────────────────────

  // GET /api/export/leads.csv
  {
    method: 'GET',
    pattern: '/api/export/leads.csv',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (
        !hasAnyPermission(orgCtx.memberRole, [
          'lead:export',
          'analytics:export'
        ])
      ) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const { exportToCSV, LEAD_EXPORT_COLUMNS } =
        await import('./services/export-service.js');
      const leads = await ctx.db.lead.findMany({
        where: { organizationId: orgCtx.organization.id },
        orderBy: { createdAt: 'desc' }
      });
      const csv = exportToCSV(
        leads as unknown as Record<string, unknown>[],
        LEAD_EXPORT_COLUMNS
      );
      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="leads.csv"'
      });
      res.end(csv);
    }
  },

  // GET /api/export/content.csv
  {
    method: 'GET',
    pattern: '/api/export/content.csv',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'analytics:export')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const { exportToCSV, CONTENT_EXPORT_COLUMNS } =
        await import('./services/export-service.js');
      const items = await ctx.db.contentItem.findMany({
        where: { organizationId: orgCtx.organization.id },
        orderBy: { createdAt: 'desc' }
      });
      const csv = exportToCSV(
        items as unknown as Record<string, unknown>[],
        CONTENT_EXPORT_COLUMNS
      );
      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="content.csv"'
      });
      res.end(csv);
    }
  },

  // GET /api/export/interactions.csv
  {
    method: 'GET',
    pattern: '/api/export/interactions.csv',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (!hasPermission(orgCtx.memberRole, 'analytics:export')) {
        return sendJson(res, 403, { error: '权限不足' });
      }
      const { exportToCSV, INTERACTION_EXPORT_COLUMNS } =
        await import('./services/export-service.js');
      const interactions = await ctx.db.interaction.findMany({
        where: { organizationId: orgCtx.organization.id },
        orderBy: { createdAt: 'desc' },
        take: 5000
      });
      const csv = exportToCSV(
        interactions as unknown as Record<string, unknown>[],
        INTERACTION_EXPORT_COLUMNS
      );
      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="interactions.csv"'
      });
      res.end(csv);
    }
  },

  // ── Chat Threads ──────────────────────────────────────────────────
  {
    method: 'POST',
    pattern: '/api/chat/threads',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as { title?: string } | null;
      const thread = await ctx.db.chatThread.create({
        data: {
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id,
          title: body?.title || null
        }
      });
      sendJson(res, 201, thread);
    }
  },
  {
    method: 'GET',
    pattern: '/api/chat/threads',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const threads = await ctx.db.chatThread.findMany({
        where: {
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id,
          status: 'active'
        },
        orderBy: { updatedAt: 'desc' },
        take: 50
      });
      sendJson(res, 200, threads);
    }
  },
  {
    method: 'GET',
    pattern: '/api/chat/threads/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const thread = await ctx.db.chatThread.findFirst({
        where: { id: ctx.params.id, organizationId: orgCtx.organization.id },
        include: { messages: { orderBy: { createdAt: 'asc' } } }
      });
      if (!thread) return sendJson(res, 404, { error: '对话不存在' });
      sendJson(res, 200, thread);
    }
  },
  {
    method: 'POST',
    pattern: '/api/chat/threads/:id/messages',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as {
        role: string;
        content: string;
        toolCalls?: unknown;
        toolResult?: unknown;
        tokensUsed?: number;
      } | null;
      if (!body?.role || !body?.content)
        return sendJson(res, 400, { error: 'Missing role or content' });
      const thread = await ctx.db.chatThread.findFirst({
        where: { id: ctx.params.id, organizationId: orgCtx.organization.id }
      });
      if (!thread) return sendJson(res, 404, { error: '对话不存在' });
      const message = await ctx.db.chatMessage.create({
        data: {
          threadId: ctx.params.id,
          role: body.role,
          content: body.content,
          toolCalls: body.toolCalls ?? undefined,
          toolResult: body.toolResult ?? undefined,
          tokensUsed: body.tokensUsed
        }
      });
      // Update thread title from first user message
      if (body.role === 'user' && !thread.title) {
        await ctx.db.chatThread.update({
          where: { id: ctx.params.id },
          data: { title: body.content.slice(0, 50) }
        });
      }
      sendJson(res, 201, message);
    }
  },
  {
    method: 'PATCH',
    pattern: '/api/chat/threads/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as { title?: string; status?: string } | null;
      const thread = await ctx.db.chatThread.findFirst({
        where: { id: ctx.params.id, organizationId: orgCtx.organization.id }
      });
      if (!thread) return sendJson(res, 404, { error: '对话不存在' });
      const updated = await ctx.db.chatThread.update({
        where: { id: ctx.params.id },
        data: {
          ...(body?.title != null && { title: body.title }),
          ...(body?.status != null && { status: body.status })
        }
      });
      sendJson(res, 200, updated);
    }
  },

  // ── Prospecting: Video Comment Mining ────────────────────────────
  {
    method: 'POST',
    pattern: '/api/prospecting/search',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      if (isRateLimited(`prospecting:${orgCtx.organization.id}`, 10, 60_000))
        return sendJson(res, 429, { error: '搜索操作过于频繁，请稍后再试' });

      const body = (ctx.body ?? {}) as Record<string, unknown>;
      const keyword = String(body.keyword ?? '');
      if (!keyword) return sendJson(res, 400, { error: 'keyword 不能为空' });

      const platform = String(body.platform ?? 'douyin');
      const topNVideos = Number(body.topNVideos ?? 5);
      const maxCommentsPerVideo = Number(body.maxCommentsPerVideo ?? 30);
      const commentScrollRounds = Number(body.commentScrollRounds ?? 8);

      // Find a browser-assist account with cookie for this platform
      const account = await ctx.db.platformAccount.findFirst({
        where: {
          organizationId: orgCtx.organization.id,
          platform: platform as never,
          mode: 'browser_assist',
          status: 'active',
          deletedAt: null,
          cookieRef: { not: '' }
        }
      });

      if (!account) {
        return sendJson(res, 400, {
          error: `没有找到 ${platform} 平台的已登录账号，请先扫码登录`
        });
      }

      const cookie = decryptToken(account.cookieRef!);
      const runnerUrl = getBrowserRunnerUrl();

      // Call browser-runner search-and-fetch-comments synchronously
      const taskId = randomUUID();
      try {
        const searchResp = await fetchWithTimeout(
          `${runnerUrl}/assist/search-and-fetch-comments`,
          {
            method: 'POST',
            headers: runnerHeaders({ 'content-type': 'application/json' }),
            body: JSON.stringify({
              platform,
              cookie,
              keyword,
              topN: topNVideos,
              headed: typeof body.headed === 'boolean' ? body.headed : false,
              commentScrollRounds,
              maxCommentsPerVideo
            })
          },
          180_000
        );

        const searchResult = (await searchResp.json()) as Record<
          string,
          unknown
        >;

        if (!searchResp.ok) {
          return sendJson(res, 502, {
            error: '搜索失败',
            details: searchResult
          });
        }

        // Analyze comments with rule-based classifier
        const results = (searchResult.results ?? []) as Array<
          Record<string, unknown>
        >;
        const prospects: Array<Record<string, unknown>> = [];
        let totalComments = 0;
        const levelCounts = { A: 0, B: 0, C: 0, D: 0 };

        for (const video of results) {
          const comments = (video.comments ?? []) as Array<
            Record<string, unknown>
          >;
          totalComments += comments.length;

          for (const comment of comments) {
            const content = String(
              comment.content ?? comment.userNickname ?? ''
            );
            if (!content || content.length < 3) continue;

            const classification = classifyByRules(content);
            levelCounts[classification.leadLevel as keyof typeof levelCounts]++;

            // Store A/B level as Interaction + Lead
            if (
              classification.leadLevel === 'A' ||
              classification.leadLevel === 'B'
            ) {
              const externalId = `prospecting-${taskId}-${String(comment.externalCommentId ?? Math.random().toString(36).slice(2, 10))}`;
              try {
                const interaction = await ctx.db.interaction.create({
                  data: {
                    organizationId: orgCtx.organization.id,
                    userId: orgCtx.user.id,
                    platform: platform as never,
                    platformAccountId: account.id,
                    externalInteractionId: externalId,
                    externalUserId: String(comment.externalUserId ?? ''),
                    externalUserName: String(comment.userNickname ?? ''),
                    type: 'comment',
                    content,
                    status: 'CLASSIFIED',
                    metadata: {
                      source: 'prospecting',
                      taskId,
                      keyword,
                      videoTitle: String(video.title ?? ''),
                      videoAuthor: String(video.author ?? ''),
                      videoContentId: String(video.contentId ?? ''),
                      intentLevel: classification.leadLevel,
                      intent: classification.intent,
                      confidence: classification.confidence
                    }
                  }
                });

                // Create classification record
                await ctx.db.interactionClassification
                  .upsert({
                    where: { interactionId: interaction.id },
                    create: {
                      interactionId: interaction.id,
                      intent: classification.intent,
                      leadLevel: classification.leadLevel,
                      confidence: classification.confidence,
                      riskLevel: classification.riskLevel,
                      summary: classification.summary,
                      tags: classification.tags as never
                    },
                    update: {}
                  })
                  .catch(() => {});

                // Create Lead
                await ctx.db.lead
                  .create({
                    data: {
                      organizationId: orgCtx.organization.id,
                      userId: orgCtx.user.id,
                      sourcePlatform: platform as never,
                      sourceAccountId: account.id,
                      sourceInteractionId: interaction.id,
                      externalUserId: String(comment.externalUserId ?? ''),
                      externalUserName: String(comment.userNickname ?? ''),
                      level: classification.leadLevel as never,
                      intent: classification.intent,
                      confidence: classification.confidence,
                      summary: content.slice(0, 200)
                    }
                  })
                  .catch(() => {});
              } catch {
                // Skip duplicate interactions
              }

              prospects.push({
                userName: comment.userNickname,
                content: content.slice(0, 100),
                leadLevel: classification.leadLevel,
                intent: classification.intent,
                confidence: classification.confidence,
                videoTitle: video.title,
                videoAuthor: video.author
              });
            }
          }
        }

        sendJson(res, 200, {
          taskId,
          keyword,
          platform,
          totalVideos: results.length,
          totalComments,
          levelCounts,
          prospects
        });
      } catch (error) {
        sendJson(res, 502, {
          error: '挖掘任务执行失败',
          taskId,
          details: error instanceof Error ? error.message : String(error)
        });
      }
    }
  },
  {
    method: 'GET',
    pattern: '/api/prospecting/tasks',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });

      // Find prospecting-sourced interactions
      const interactions = await ctx.db.interaction.findMany({
        where: {
          organizationId: orgCtx.organization.id,
          metadata: { path: ['source'], equals: 'prospecting' }
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          content: true,
          externalUserName: true,
          platform: true,
          createdAt: true,
          metadata: true,
          classification: {
            select: { leadLevel: true, intent: true, confidence: true }
          }
        }
      });

      sendJson(res, 200, { items: interactions });
    }
  },
  {
    method: 'GET',
    pattern: '/api/prospecting/tasks/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });

      const taskId = ctx.params.id;

      const interactions = await ctx.db.interaction.findMany({
        where: {
          organizationId: orgCtx.organization.id,
          metadata: { path: ['taskId'], equals: taskId }
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          content: true,
          externalUserName: true,
          platform: true,
          createdAt: true,
          metadata: true,
          classification: {
            select: {
              leadLevel: true,
              intent: true,
              confidence: true,
              riskLevel: true
            }
          },
          leads: { select: { id: true, level: true, status: true } }
        }
      });

      if (interactions.length === 0) {
        return sendJson(res, 404, { error: '挖掘任务未找到' });
      }

      // Aggregate summary
      const meta = interactions[0].metadata as Record<string, unknown> | null;
      const levelCounts = { A: 0, B: 0, C: 0, D: 0 };
      for (const it of interactions) {
        const level = it.classification?.leadLevel ?? 'C';
        levelCounts[level as keyof typeof levelCounts] =
          (levelCounts[level as keyof typeof levelCounts] || 0) + 1;
      }

      sendJson(res, 200, {
        taskId,
        keyword: meta?.keyword ?? '',
        platform: interactions[0].platform,
        totalProspects: interactions.length,
        levelCounts,
        prospects: interactions.map((it) => ({
          id: it.id,
          userName: it.externalUserName,
          content: it.content,
          classification: it.classification,
          videoTitle: (it.metadata as Record<string, unknown>)?.videoTitle,
          videoAuthor: (it.metadata as Record<string, unknown>)?.videoAuthor,
          lead: it.leads?.[0],
          createdAt: it.createdAt
        }))
      });
    }
  },

  // ── Agent Intelligence ──────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/agent/suggestions',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const { generateProactiveSuggestions } =
        await import('./services/agent-suggestions.js');
      const suggestions = await generateProactiveSuggestions(
        ctx.db,
        orgCtx.organization.id
      );
      sendJson(res, 200, { suggestions });
    }
  },
  {
    method: 'GET',
    pattern: '/api/settings/agent-preferences',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const config = await ctx.db.appConfig.findFirst({
        where: {
          organizationId: orgCtx.organization.id,
          key: 'agent_user_preferences'
        }
      });
      sendJson(
        res,
        200,
        config?.value ?? {
          preferredPlatforms: [],
          defaultContentType: 'text_image',
          preferredPublishTimes: [],
          contentStylePreferences: '',
          replyStylePreferences: '',
          avoidTopics: [],
          brandVoice: ''
        }
      );
    }
  },
  {
    method: 'PUT',
    pattern: '/api/settings/agent-preferences',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = ctx.body as Record<string, unknown>;
      const existing = await ctx.db.appConfig.findFirst({
        where: {
          organizationId: orgCtx.organization.id,
          key: 'agent_user_preferences'
        }
      });
      if (existing) {
        const updated = await ctx.db.appConfig.update({
          where: { id: existing.id },
          data: { value: body as never }
        });
        sendJson(res, 200, updated.value);
      } else {
        const created = await ctx.db.appConfig.create({
          data: {
            organizationId: orgCtx.organization.id,
            userId: orgCtx.user.id,
            key: 'agent_user_preferences',
            value: body as never
          }
        });
        sendJson(res, 201, created.value);
      }
    }
  },
  // ── LLM Config (org-level; apiKey encrypted at rest) ─────────
  // Lets the operator configure the model provider from the cockpit UI
  // instead of .env. Stored in AppConfig(key='llm_config'); the apiKey is
  // encrypted with the same TOKEN_ENCRYPTION_KEY used for platform cookies
  // and is NEVER returned in plaintext (GET only reports hasApiKey).
  {
    method: 'GET',
    pattern: '/api/settings/llm',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const row = await ctx.db.appConfig.findFirst({
        where: { organizationId: orgCtx.organization.id, key: 'llm_config' },
        select: { value: true }
      });
      const cfg = (row?.value ?? null) as {
        provider?: string;
        apiKeyEncrypted?: string;
        baseUrl?: string;
        model?: string;
        updatedAt?: string;
      } | null;
      sendJson(res, 200, {
        provider: cfg?.provider ?? 'openai',
        baseUrl: cfg?.baseUrl ?? '',
        model: cfg?.model ?? '',
        hasApiKey: !!cfg?.apiKeyEncrypted,
        updatedAt: cfg?.updatedAt ?? null
      });
    }
  },
  {
    method: 'PUT',
    pattern: '/api/settings/llm',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = (ctx.body ?? {}) as {
        provider?: string;
        apiKey?: string;
        baseUrl?: string;
        model?: string;
      };
      const provider = body.provider === 'anthropic' ? 'anthropic' : 'openai';
      const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
      const model = typeof body.model === 'string' ? body.model.trim() : '';
      // Preserve the existing encrypted apiKey when the operator leaves the
      // field blank (so they can edit baseUrl/model without re-entering it).
      const existing = await ctx.db.appConfig.findFirst({
        where: { organizationId: orgCtx.organization.id, key: 'llm_config' },
        select: { id: true, value: true }
      });
      const prev = (existing?.value ?? {}) as { apiKeyEncrypted?: string };
      let apiKeyEncrypted = prev.apiKeyEncrypted;
      if (typeof body.apiKey === 'string' && body.apiKey.trim() !== '') {
        apiKeyEncrypted = encryptToken(body.apiKey.trim());
      }
      const updatedAt = new Date().toISOString();
      const value = {
        provider,
        baseUrl,
        model,
        apiKeyEncrypted,
        updatedAt
      };
      if (existing) {
        await ctx.db.appConfig.update({
          where: { id: existing.id },
          data: { value: value as never }
        });
      } else {
        await ctx.db.appConfig.create({
          data: {
            organizationId: orgCtx.organization.id,
            userId: orgCtx.user.id,
            key: 'llm_config',
            value: value as never
          }
        });
      }
      sendJson(res, 200, {
        provider,
        baseUrl,
        model,
        hasApiKey: !!apiKeyEncrypted,
        updatedAt
      });
    }
  },
  // ── Agent Runs (Workbench trigger + query) ─────────────────────
  {
    method: 'POST',
    pattern: '/api/agent/runs',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const body = (ctx.body ?? {}) as {
        autonomyLevel?: string;
        dryRun?: boolean;
      };
      // First cut: only L1 and L2 are available. L3_FULL_AUTOPILOT is a
      // future goal (per spec), not a first-cut lever. Reject unknown /
      // non-string values with 400.
      const ALLOWED_AUTONOMY = new Set([
        'L1_COPILOT',
        'L2_AUTOPILOT_LIGHT'
      ]);
      const autonomy =
        body.autonomyLevel === undefined
          ? 'L2_AUTOPILOT_LIGHT'
          : body.autonomyLevel;
      if (
        typeof autonomy !== 'string' ||
        !ALLOWED_AUTONOMY.has(autonomy)
      ) {
        return sendJson(res, 400, {
          error:
            'invalid autonomyLevel: first cut allows L1_COPILOT or L2_AUTOPILOT_LIGHT only'
        });
      }
      // Always persist the AgentRun first — enqueue is best-effort so the
      // trigger stays testable without Redis, and the daily scheduler /
      // manual re-trigger recover any run that failed to enqueue.
      const run = await ctx.db.agentRun.create({
        data: {
          organizationId: orgCtx.organization.id,
          userId: orgCtx.user.id,
          agentName: autonomy,
          status: 'pending',
          input: { dryRun: body.dryRun ?? false }
        }
      });
      let queued = false;
      try {
        const { Queue } = await import('bullmq');
        const redisUrl =
          process.env.REDIS_URL || 'redis://localhost:6379';
        const queue = new Queue('agent.run', {
          connection: { url: redisUrl }
        });
        try {
          await queue.add(
            'agent-run',
            { runId: run.id },
            {
              attempts: 2,
              backoff: { type: 'exponential', delay: 10_000 }
            }
          );
          queued = true;
        } finally {
          await queue.close();
        }
      } catch (err) {
        routeLogger.warn('agent.run enqueue failed (best-effort)', {
          runId: run.id,
          error: err instanceof Error ? err.message : String(err)
        });
      }
      sendJson(res, 200, { runId: run.id, queued });
    }
  },
  {
    method: 'GET',
    pattern: '/api/agent/runs/:id',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const run = await ctx.db.agentRun.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id
        }
      });
      if (!run) return sendJson(res, 404, { error: 'run not found' });
      const state = (run.output ?? {}) as Record<string, unknown>;
      const input = (run.input ?? {}) as Record<string, unknown>;
      sendJson(res, 200, {
        id: run.id,
        status: run.status,
        currentNode: state.currentNode ?? null,
        nodeResults: state.nodeResults ?? {},
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        tokensUsed: run.tokensUsed ?? 0,
        dryRun: input.dryRun === true,
        metadata: run.metadata ?? {},
        error: run.error
      });
    }
  },
  // List recent runs (cockpit history). Latest first, org-scoped.
  {
    method: 'GET',
    pattern: '/api/agent/runs',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const runs = await ctx.db.agentRun.findMany({
        where: { organizationId: orgCtx.organization.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true,
          tokensUsed: true,
          input: true,
          output: true,
          error: true
        }
      });
      const items = runs.map((r) => {
        const state = (r.output ?? {}) as Record<string, unknown>;
        const nodeResults = (state.nodeResults ?? {}) as Record<
          string,
          { escalatedItems?: unknown[] }
        >;
        const escalationCount = Object.values(nodeResults).reduce(
          (acc, nr) => acc + (nr?.escalatedItems?.length ?? 0),
          0
        );
        const input = (r.input ?? {}) as Record<string, unknown>;
        return {
          id: r.id,
          status: r.status,
          currentNode: state.currentNode ?? null,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt,
          createdAt: r.createdAt,
          tokensUsed: r.tokensUsed ?? 0,
          dryRun: input.dryRun === true,
          escalationCount,
          error: r.error
        };
      });
      sendJson(res, 200, { items });
    }
  },
  // Approve escalated items AND auto-resume a paused run (cockpit "批准并续跑").
  // Collects every escalated {node, toolName} from the run's nodeResults, writes
  // them to metadata.approvals, then re-enqueues the agent.run job. The worker
  // sees the PAUSED run, restores its state, and re-executes the paused node
  // with these tools unlocked (see runDomainAgent `approvedTools`).
  {
    method: 'POST',
    pattern: '/api/agent/runs/:id/approve',
    handler: async (req, res, ctx) => {
      const orgCtx = await getOrganizationContext(req, ctx.db);
      if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
      const run = await ctx.db.agentRun.findFirst({
        where: {
          id: ctx.params.id,
          organizationId: orgCtx.organization.id
        },
        select: { id: true, status: true, output: true, metadata: true }
      });
      if (!run) return sendJson(res, 404, { error: 'run not found' });
      if (run.status !== 'paused') {
        return sendJson(res, 409, {
          error: `只能批准并续跑已暂停的运行（当前状态：${run.status}）`
        });
      }
      const state = (run.output ?? {}) as Record<string, unknown>;
      const nodeResults = (state.nodeResults ?? {}) as Record<
        string,
        { escalatedItems?: Array<{ toolName: string }> }
      >;
      // De-dup {node, toolName} pairs.
      const seen = new Set<string>();
      const approvals: Array<{ node: string; toolName: string }> = [];
      for (const [node, nr] of Object.entries(nodeResults)) {
        for (const e of nr?.escalatedItems ?? []) {
          const key = `${node}:${e.toolName}`;
          if (!seen.has(key)) {
            seen.add(key);
            approvals.push({ node, toolName: e.toolName });
          }
        }
      }
      const meta = ((run.metadata as Record<string, unknown> | null) ?? {}) as Record<
        string,
        unknown
      >;
      await ctx.db.agentRun.update({
        where: { id: run.id },
        data: {
          metadata: {
            ...meta,
            approvals,
            resumeRequestedAt: new Date().toISOString(),
            resumeRequestedBy: orgCtx.user.id
          }
        }
      });

      // Best-effort re-enqueue (mirrors POST /api/agent/runs trigger).
      let queued = false;
      try {
        const { Queue } = await import('bullmq');
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        const queue = new Queue('agent.run', { connection: { url: redisUrl } });
        try {
          await queue.add(
            'agent-run',
            { runId: run.id },
            { attempts: 2, backoff: { type: 'exponential', delay: 10_000 } }
          );
          queued = true;
        } finally {
          await queue.close();
        }
      } catch (err) {
        routeLogger.warn('agent.run resume enqueue failed (best-effort)', {
          runId: run.id,
          error: err instanceof Error ? err.message : String(err)
        });
      }
      sendJson(res, 200, { id: run.id, approvals, queued });
    }
  }
];

// ── Helpers ───────────────────────────────────────────────────────

type PublishJobEnqueuePayload = {
  id: string;
  contentVariantId: string;
  platformAccountId: string;
  platform: string;
  contentType: string;
  mode: string;
};

async function enqueuePublishJob(job: PublishJobEnqueuePayload): Promise<void> {
  const { Queue } = await import('bullmq');
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const queue = new Queue('publish.execute', { connection: { url: redisUrl } });
  await queue.add('publish-execute', {
    publishJobId: job.id,
    contentVariantId: job.contentVariantId,
    platformAccountId: job.platformAccountId,
    platform: job.platform,
    contentType: job.contentType,
    mode: job.mode
  });
  await queue.close();
}

async function startPublishJob(
  db: DatabaseClient,
  job: PublishJobEnqueuePayload
): Promise<void> {
  await db.publishJob.update({
    where: { id: job.id },
    data: { status: 'RUNNING', startedAt: new Date(), lastError: null }
  });
  await applyPublishProgress(db, job.id, 'queued');
  await enqueuePublishJob(job);
}

async function getOrCreateDefaultProject(
  db: DatabaseClient,
  userId: string,
  organizationId: string
): Promise<string> {
  const existing = await db.contentProject.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: 'asc' }
  });
  if (existing) return existing.id;

  try {
    const created = await db.contentProject.create({
      data: {
        organizationId,
        userId,
        title: '默认项目',
        description: '系统自动创建的默认内容项目',
        status: 'ready'
      }
    });
    return created.id;
  } catch {
    // Concurrent create may have won — find the existing one
    const existing2 = await db.contentProject.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' }
    });
    if (existing2) return existing2.id;
    throw new Error('Failed to create default project');
  }
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function aggregateByDate(
  items: Array<{ createdAt: Date; [k: string]: unknown }>,
  dateField: string,
  groupField?: string
) {
  const buckets = new Map<string, Record<string, number>>();
  for (const item of items) {
    const date = new Date(item[dateField] as Date);
    const key = date.toISOString().slice(0, 10);
    const group = groupField ? String(item[groupField] ?? 'unknown') : 'total';
    const bucket = buckets.get(key) ?? {};
    bucket[group] = (bucket[group] ?? 0) + 1;
    buckets.set(key, bucket);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));
}

// ── Route Matching ────────────────────────────────────────────────

interface MatchResult {
  route: Route;
  params: Record<string, string>;
}

// Route matching cache for static paths (no :params)
const routeCache = new Map<
  string,
  { route: Route; params: Record<string, string> } | null
>();
const ROUTE_CACHE_MAX = 500;

function matchRoute(method: string, pathname: string): MatchResult | null {
  // Check cache for static routes
  const cacheKey = `${method}:${pathname}`;
  const cached = routeCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const result = matchRouteUncached(method, pathname);

  // Only cache static paths (no param segments) and limit cache size
  if (
    !pathname.split('/').some((p) => p.match(/^[0-9a-f]{8,}/i)) &&
    routeCache.size < ROUTE_CACHE_MAX
  ) {
    routeCache.set(cacheKey, result);
  }

  return result;
}

function matchRouteUncached(
  method: string,
  pathname: string
): MatchResult | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const params = matchPattern(route.pattern, pathname);
    if (params !== null) return { route, params };
  }
  return null;
}

function matchPattern(
  pattern: string,
  pathname: string
): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        reject(new Error('Request body too large (max 10MB)'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    req.on('error', reject);
  });
}

interface UploadedFile {
  fileName: string;
  contentType: string;
  buffer: Buffer;
}

function readMultipart(
  req: IncomingMessage
): Promise<{ fields: Record<string, string>; files: UploadedFile[] }> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, defParamCharset: 'utf8' });
    const fields: Record<string, string> = {};
    const files: UploadedFile[] = [];

    busboy.on('field', (name: string, val: string) => {
      fields[name] = val;
    });
    busboy.on(
      'file',
      (
        _name: string,
        stream: NodeJS.ReadableStream,
        info: { filename: string; mimeType: string }
      ) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          files.push({
            fileName: info.filename,
            contentType: info.mimeType,
            buffer: Buffer.concat(chunks)
          });
        });
      }
    );
    busboy.on('finish', () => resolve({ fields, files }));
    busboy.on('error', reject);
    req.pipe(busboy);
  });
}

const UPLOADS_DIR = join(process.cwd(), 'uploads');

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf'
};

function resolveContentType(file: UploadedFile): string {
  if (file.contentType) return file.contentType;
  const ext = extname(file.fileName).toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

const ALLOWED_UPLOAD_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.mp4',
  '.mov',
  '.pdf'
];

function saveUploadedFile(file: UploadedFile): {
  fileName: string;
  sourceUrl: string;
} {
  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
  const ext = extname(file.fileName).toLowerCase();
  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) {
    throw new Error(
      `File type "${ext}" is not allowed. Allowed types: ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')}`
    );
  }
  const savedName = `${randomUUID()}${ext}`;
  const filePath = join(UPLOADS_DIR, savedName);
  writeFileSync(filePath, file.buffer);
  return { fileName: file.fileName, sourceUrl: `/uploads/${savedName}` };
}

export async function routeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  db: DatabaseClient
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const method = req.method ?? 'GET';

  // API versioning: strip /v1/ prefix so /api/v1/content → /api/content
  url.pathname = url.pathname.replace(/^\/api\/v\d+\//, '/api/');

  // Serve static uploads (auth required + path traversal protection)
  if (method === 'GET' && url.pathname.startsWith('/uploads/')) {
    // Require authentication — only logged-in users can access uploaded files
    const authUser = await getAuthenticatedUser(req, db);
    if (!authUser) {
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }
    const requestedFile = url.pathname.slice('/uploads/'.length);
    const filePath = join(UPLOADS_DIR, requestedFile);
    // Prevent path traversal: resolved path must be within UPLOADS_DIR
    if (
      !filePath.startsWith(resolve(UPLOADS_DIR) + sep) &&
      filePath !== resolve(UPLOADS_DIR)
    ) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    // Only serve known safe file types
    const ext = extname(filePath).toLowerCase();
    const safeExts = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.webp',
      '.mp4',
      '.mov',
      '.pdf'
    ];
    if (!safeExts.includes(ext)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.pdf': 'application/pdf'
    };
    res.writeHead(200, {
      'content-type': mimeTypes[ext] ?? 'application/octet-stream'
    });
    createReadStream(filePath).pipe(res);
    return;
  }

  const match = matchRoute(method, url.pathname);
  if (!match) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  const isMultipart = (req.headers['content-type'] ?? '').startsWith(
    'multipart/form-data'
  );
  let body: unknown = null;
  let uploadedFiles: UploadedFile[] = [];

  if (
    isMultipart &&
    (method === 'POST' || method === 'PUT' || method === 'PATCH')
  ) {
    const parsed = await readMultipart(req);
    body = parsed.fields;
    uploadedFiles = parsed.files;
  } else if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    body = await readBody(req);
  }

  await match.route.handler(req, res, {
    db,
    url,
    params: match.params,
    body,
    files: uploadedFiles
  });
}
