import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import {
  createDatabaseClient,
  enrichProspectProfile,
  executeProspectingTask,
  findProspectingAccount,
  queueProspectProfileEnrich,
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
// 故意让 B 更老：证明绑定关系优先于“最老账号”回退
let olderAccountId: string;
let boundAccountId: string;
let taskId: string;

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

  const olderAccount = await db.platformAccount.create({
    data: {
      organizationId,
      userId,
      platform: 'douyin',
      name: '获客账号 B（更老）',
      mode: 'browser_assist',
      status: 'active',
      cookieRef: 'encrypted-cookie-b'
    }
  });
  const boundAccount = await db.platformAccount.create({
    data: {
      organizationId,
      userId,
      platform: 'douyin',
      name: '获客账号 A（绑定）',
      mode: 'browser_assist',
      status: 'active',
      cookieRef: 'encrypted-cookie-a'
    }
  });
  olderAccountId = olderAccount.id;
  boundAccountId = boundAccount.id;

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

  await saveOrgLlmConfig(db, organizationId, userId, {
    provider: 'openai',
    apiKey: 'test-key',
    baseUrl: llmBaseUrl,
    model: 'test-model'
  });
  const analyzed = await api.post('/api/prospecting/plan', {
    platform: 'douyin',
    platformAccountId: boundAccountId,
    requirement
  });
  expect(analyzed.status, JSON.stringify(analyzed.body)).toBe(200);
  const created = await api.post('/api/prospecting/tasks', {
    planId: analyzed.body.planId,
    enabledStrategyIds: ['pain', 'purchase'],
    minRelevanceScore: 45
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  taskId = created.body.id;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => llmServer.close(() => resolve()));
  await db.$disconnect();
});

describe('prospecting account binding', () => {
  it('rejects plan analysis for accounts outside the organization', async () => {
    const otherOrg = await db.organization.create({
      data: { name: '其他组织', slug: `other-org-${Date.now()}` }
    });
    const foreignAccount = await db.platformAccount.create({
      data: {
        organizationId: otherOrg.id,
        userId,
        platform: 'douyin',
        name: '外部账号',
        mode: 'browser_assist',
        status: 'active',
        cookieRef: 'encrypted-cookie-foreign'
      }
    });

    // 数据层：组织过滤兜底
    await expect(
      findProspectingAccount(db, organizationId, 'douyin', foreignAccount.id)
    ).resolves.toBeNull();

    // API 层：跨组织账号 ID 不能通过分析接口
    const response = await api.post('/api/prospecting/plan', {
      platform: 'douyin',
      platformAccountId: foreignAccount.id,
      requirement
    });
    expect(response.status).toBe(409);
  });

  it('fails loudly when the bound account is expired and never switches accounts', async () => {
    await db.platformAccount.update({
      where: { id: boundAccountId },
      data: { status: 'expired' }
    });

    // API 执行入口：绑定账号失效时在配额检查前拒绝
    const executed = await api.post(`/api/prospecting/tasks/${taskId}/run`, {
      forceRecrawl: false
    });
    expect(executed.status).toBe(400);
    expect(JSON.stringify(executed.body)).toContain('绑定的账号');

    // 数据层执行器：报错点名绑定账号，而不是引导重新登录
    await db.prospectingTask.updateMany({
      where: { id: taskId },
      data: { status: 'failed', executionToken: 'tok-test' }
    });
    await expect(
      executeProspectingTask(db, taskId, organizationId, userId, 'tok-test', {
        forceRecrawl: false
      })
    ).rejects.toThrow(/获客账号 A（绑定）/);

    // B 账号没有任何账本行，A 的账本（分析阶段初始化）没有任何消耗：
    // 失败路径没有静默切换，也没有产生采集副作用
    const ledgers = await db.prospectingGuardLedger.findMany({
      where: { platformAccountId: { in: [boundAccountId, olderAccountId] } }
    });
    expect(
      ledgers.filter((row) => row.platformAccountId === olderAccountId)
    ).toHaveLength(0);
    for (const row of ledgers) {
      expect(row.videosCrawled).toBe(0);
      expect(row.profilesFetched).toBe(0);
    }

    await db.platformAccount.update({
      where: { id: boundAccountId },
      data: { status: 'active' }
    });
  });

  it('snapshots the task account at enrich queue time and keeps it during execution', async () => {
    const candidate = await db.prospectCandidate.create({
      data: {
        prospectingTaskId: taskId,
        organizationId,
        platform: 'douyin',
        keyword: '私域工具',
        userKey: 'douyin:u-8888',
        externalUserId: '8888',
        userNickname: '目标客户',
        userHomepage: 'https://www.douyin.com/user/8888',
        content: '评论内容',
        leadLevel: 'B',
        relevanceScore: 62
      }
    });

    // 入队快照必须取任务绑定的 A，而不是更老的 B
    await queueProspectProfileEnrich(db, candidate.id, organizationId);
    const queued = await db.prospectCandidate.findUniqueOrThrow({
      where: { id: candidate.id }
    });
    expect(queued.metadata).toMatchObject({
      enrichStatus: 'queued',
      enrichAccountId: boundAccountId
    });

    // 执行期间绑定账号失效：报错且不回退到 B，也不产生 B 的采集记录
    await db.platformAccount.update({
      where: { id: boundAccountId },
      data: { status: 'expired' }
    });
    await expect(
      enrichProspectProfile(db, candidate.id, organizationId, userId)
    ).rejects.toThrow(/绑定的采集账号已失效/);

    const afterMetadata = await db.prospectCandidate.findUniqueOrThrow({
      where: { id: candidate.id }
    });
    expect(afterMetadata.metadata).toMatchObject({
      enrichAccountId: boundAccountId
    });
    const bLedger = await db.prospectingGuardLedger.count({
      where: { platformAccountId: olderAccountId }
    });
    expect(bLedger).toBe(0);

    await db.platformAccount.update({
      where: { id: boundAccountId },
      data: { status: 'active' }
    });
  });

  it('requires an explicit account for captcha endpoints', async () => {
    const missing = await api.post('/api/prospecting/captcha/start');
    expect(missing.status).toBe(400);
    expect(JSON.stringify(missing.body)).toContain('请先选择执行账号');

    const unknown = await api.post(
      `/api/prospecting/captcha/start?platformAccountId=00000000-0000-4000-8000-000000000000`
    );
    expect(unknown.status).toBe(400);
    expect(JSON.stringify(unknown.body)).toContain('所选账号不可用');
  });
});
