import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  saveOrgLlmConfig,
  seedDatabase
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { createAuthFetch, getTestAuth } from '../../setup/test-auth';

const db = createDatabaseClient();
let server: Server;
let api: ReturnType<typeof createAuthFetch>;
let organizationId: string;
let userId: string;
let llmServer: Server;
let accountAId: string;
let accountBId: string;

const requirement =
  '寻找正在考虑采购私域运营工具的中小企业负责人，优先零售行业，排除同行服务商';
const plan = {
  version: 1,
  requirement,
  intent: {
    version: 1,
    summary: '寻找有私域工具采购意向的中小企业负责人',
    offering: '私域运营工具',
    targetAudience: {
      roles: ['负责人'],
      industries: ['零售'],
      organizationTypes: ['中小企业'],
      regions: []
    },
    painPoints: ['私域运营效率低'],
    useCases: ['客户运营'],
    buyingSignals: ['采购', '选型'],
    exclusions: ['同行服务商'],
    ambiguities: []
  },
  strategies: [
    {
      id: 'pain',
      type: 'pain_help',
      title: '痛点求助',
      rationale: '发现主动求助者',
      enabled: true,
      priority: 1,
      queries: ['私域运营做不起来'],
      negativeSignals: ['代运营招商'],
      budget: { maxQueries: 1, maxVideos: 4 }
    },
    {
      id: 'purchase',
      type: 'purchase_evaluation',
      title: '采购选型',
      rationale: '发现正在选型的客户',
      enabled: true,
      priority: 1,
      queries: ['私域工具怎么选'],
      negativeSignals: [],
      budget: { maxQueries: 1, maxVideos: 4 }
    }
  ],
  limits: { maxTotalQueries: 8, maxTotalVideos: 8, maxCommentsPerVideo: 30 }
} as const;

async function createDraft(platformAccountId: string) {
  const analyzed = await api.post('/api/prospecting/plan', {
    platform: 'douyin',
    platformAccountId,
    requirement
  });
  expect(analyzed.status, JSON.stringify(analyzed.body)).toBe(200);
  return analyzed.body.planId as string;
}

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { address: string; port: number };
  const baseUrl = `http://${address.address}:${address.port}`;
  const auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);
  organizationId = auth.orgId;
  const user = await db.user.findFirstOrThrow({
    where: { email: 'admin@ai-growth-ops.local' }
  });
  userId = user.id;

  const accountA = await db.platformAccount.create({
    data: {
      organizationId,
      userId,
      platform: 'douyin',
      name: '多选账号 A',
      mode: 'browser_assist',
      status: 'active',
      cookieRef: 'encrypted-cookie-multi-a'
    }
  });
  const accountB = await db.platformAccount.create({
    data: {
      organizationId,
      userId,
      platform: 'douyin',
      name: '多选账号 B',
      mode: 'browser_assist',
      status: 'active',
      cookieRef: 'encrypted-cookie-multi-b'
    }
  });
  accountAId = accountA.id;
  accountBId = accountB.id;

  llmServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 0,
        model: 'test-model',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: JSON.stringify(plan) }
          }
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      })
    );
  });
  await new Promise<void>((resolve) =>
    llmServer.listen(0, '127.0.0.1', resolve)
  );
  const llmAddress = llmServer.address() as { address: string; port: number };
  const llmBaseUrl = `http://${llmAddress.address}:${llmAddress.port}/v1`;

  await saveOrgLlmConfig(db, organizationId, userId, {
    provider: 'openai',
    apiKey: 'test-key',
    baseUrl: llmBaseUrl,
    model: 'test-model'
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => llmServer.close(() => resolve()));
  await db.$disconnect();
});

describe('prospecting multi-account task creation', () => {
  it('creates one task per selected account in a single submission', async () => {
    const planId = await createDraft(accountAId);
    const created = await api.post('/api/prospecting/tasks', {
      planId,
      enabledStrategyIds: ['pain', 'purchase'],
      minRelevanceScore: 45,
      platformAccountIds: [accountAId, accountBId]
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const tasks = created.body.tasks as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(2);
    expect(new Set(tasks.map((task) => task.platformAccountId))).toEqual(
      new Set([accountAId, accountBId])
    );
    for (const task of tasks) {
      expect(task.platform).toBe('douyin');
      expect(task.requirement).toBe(requirement);
      expect(task.status).toBe('draft');
    }

    // 草稿已被消费：同一 planId 不能再次创建
    const reused = await api.post('/api/prospecting/tasks', {
      planId,
      enabledStrategyIds: ['pain', 'purchase'],
      minRelevanceScore: 45,
      platformAccountIds: [accountAId]
    });
    expect(reused.status).toBe(404);
  });

  it('rejects the whole submission when any account is unusable and keeps the draft', async () => {
    const expiredAccount = await db.platformAccount.create({
      data: {
        organizationId,
        userId,
        platform: 'douyin',
        name: '多选账号 C（已过期）',
        mode: 'browser_assist',
        status: 'expired',
        cookieRef: 'encrypted-cookie-multi-c'
      }
    });
    const planId = await createDraft(accountAId);

    const created = await api.post('/api/prospecting/tasks', {
      planId,
      enabledStrategyIds: ['pain', 'purchase'],
      minRelevanceScore: 45,
      platformAccountIds: [accountAId, expiredAccount.id]
    });
    expect(created.status).toBe(400);
    expect(JSON.stringify(created.body)).toContain('不可用');
    expect(JSON.stringify(created.body)).toContain('多选账号 C（已过期）');

    // all-or-nothing：草稿未消费、任务未创建
    const draft = await db.prospectingPlanDraft.findUniqueOrThrow({
      where: { id: planId }
    });
    expect(draft.consumedAt).toBeNull();
    const count = await db.prospectingTask.count({
      where: { organizationId, platformAccountId: expiredAccount.id }
    });
    expect(count).toBe(0);

    // 草稿仍可用：剔除失效账号后成功创建
    const retried = await api.post('/api/prospecting/tasks', {
      planId,
      enabledStrategyIds: ['pain', 'purchase'],
      minRelevanceScore: 45,
      platformAccountIds: [accountAId]
    });
    expect(retried.status, JSON.stringify(retried.body)).toBe(201);

    await db.platformAccount.delete({
      where: { id: expiredAccount.id }
    });
  });

  it('rejects accounts from another organization', async () => {
    const otherOrg = await db.organization.create({
      data: { name: '其他组织', slug: `other-org-multi-${Date.now()}` }
    });
    const foreignAccount = await db.platformAccount.create({
      data: {
        organizationId: otherOrg.id,
        userId,
        platform: 'douyin',
        name: '外部多选账号',
        mode: 'browser_assist',
        status: 'active',
        cookieRef: 'encrypted-cookie-multi-foreign'
      }
    });

    const planId = await createDraft(accountAId);
    const created = await api.post('/api/prospecting/tasks', {
      planId,
      enabledStrategyIds: ['pain', 'purchase'],
      minRelevanceScore: 45,
      platformAccountIds: [foreignAccount.id]
    });
    expect(created.status).toBe(400);
    expect(JSON.stringify(created.body)).toContain('不可用');

    const draft = await db.prospectingPlanDraft.findUniqueOrThrow({
      where: { id: planId }
    });
    expect(draft.consumedAt).toBeNull();

    await db.platformAccount.delete({ where: { id: foreignAccount.id } });
    await db.organization.delete({ where: { id: otherOrg.id } });
  });

  it('keeps the legacy single-task behavior when no account array is passed', async () => {
    const planId = await createDraft(accountBId);
    const created = await api.post('/api/prospecting/tasks', {
      planId,
      enabledStrategyIds: ['pain', 'purchase'],
      minRelevanceScore: 45
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.platformAccountId).toBe(accountBId);
    expect(created.body.id).toBeTruthy();
  });

  it('returns platformAccountName in the task list', async () => {
    const list = await api.get('/api/prospecting/tasks?page=1&pageSize=50');
    expect(list.status).toBe(200);
    const items = list.body.items as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThan(0);
    const byAccount = new Map(
      items.map((item) => [item.platformAccountId as string, item])
    );
    expect(byAccount.get(accountAId)?.platformAccountName).toBe('多选账号 A');
    expect(byAccount.get(accountBId)?.platformAccountName).toBe('多选账号 B');

    // 历史未绑定账号的任务：platformAccountName 为 null
    const legacy = await db.prospectingTask.create({
      data: {
        organizationId,
        userId,
        platform: 'douyin',
        platformAccountId: null,
        keywords: [],
        requirement: '历史任务',
        intent: plan.intent as never,
        strategyPlan: plan as never,
        planVersion: 1,
        topNVideos: 1,
        maxCommentsPerVideo: 30,
        commentScrollRounds: 8,
        minRelevanceScore: 40,
        status: 'draft'
      }
    });
    const refreshed = await api.get('/api/prospecting/tasks?page=1&pageSize=50');
    const legacyItem = (
      refreshed.body.items as Array<Record<string, unknown>>
    ).find((item) => item.id === legacy.id);
    expect(legacyItem).toBeTruthy();
    expect(legacyItem?.platformAccountName).toBeNull();
  });
});
