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
let llmBaseUrl: string;
let selectedAccountId: string;
let otherAccountId: string;

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
  const [selectedAccount, otherAccount] = await Promise.all([
    db.platformAccount.create({
      data: {
        organizationId,
        userId,
        platform: 'douyin',
        name: '获客账号 A',
        mode: 'browser_assist',
        status: 'active',
        cookieRef: 'encrypted-cookie-a'
      }
    }),
    db.platformAccount.create({
      data: {
        organizationId,
        userId,
        platform: 'douyin',
        name: '获客账号 B',
        mode: 'browser_assist',
        status: 'active',
        cookieRef: 'encrypted-cookie-b'
      }
    })
  ]);
  selectedAccountId = selectedAccount.id;
  otherAccountId = otherAccount.id;
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
  llmBaseUrl = `http://${llmAddress.address}:${llmAddress.port}/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => llmServer.close(() => resolve()));
  await db.$disconnect();
});

describe('intent-driven prospecting API', () => {
  it('rejects the legacy keyword task contract', async () => {
    const response = await api.post('/api/prospecting/tasks', {
      platform: 'douyin',
      keywords: ['私域工具']
    });
    expect(response.status).toBe(400);
  });

  it('creates one task from a server-owned plan draft', async () => {
    await saveOrgLlmConfig(db, organizationId, userId, {
      provider: 'openai',
      apiKey: 'test-key',
      baseUrl: llmBaseUrl,
      model: 'test-model'
    });
    const analyzed = await api.post('/api/prospecting/plan', {
      platform: 'douyin',
      platformAccountId: selectedAccountId,
      requirement
    });
    expect(analyzed.status, JSON.stringify(analyzed.body)).toBe(200);
    expect(analyzed.body.plan.strategies).toHaveLength(2);

    const created = await api.post('/api/prospecting/tasks', {
      planId: analyzed.body.planId,
      enabledStrategyIds: ['pain', 'purchase'],
      minRelevanceScore: 45
    });
    expect(created.status).toBe(201);
    expect(created.body.requirement).toBe(requirement);
    expect(created.body.keywords).toEqual([]);
    expect(created.body.strategyPlan.strategies).toHaveLength(2);
    expect(created.body.platformAccountId).toBe(selectedAccountId);
    expect(created.body.platformAccountId).not.toBe(otherAccountId);

    const reused = await api.post('/api/prospecting/tasks', {
      planId: analyzed.body.planId,
      enabledStrategyIds: ['pain', 'purchase']
    });
    expect(reused.status).toBe(404);
  });

  it('requires an explicit account when more than one is available', async () => {
    const response = await api.post('/api/prospecting/plan', {
      platform: 'douyin',
      requirement
    });
    expect(response.status).toBe(400);
  });
});
