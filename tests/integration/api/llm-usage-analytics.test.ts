import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  getLlmUsageSummary,
  notifyLlmHealthIssue,
  resetDatabase,
  seedDatabase,
  type DatabaseClient
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { createAuthFetch, getTestAuth } from '../../setup/test-auth';

const db: DatabaseClient = createDatabaseClient();
let api: ReturnType<typeof createAuthFetch>;
let organizationId: string;

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  const server = createApiServer({ db });
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', resolve)
  );
  const addr = server.address() as { address: string; port: number };
  const auth = await getTestAuth(db, `http://${addr.address}:${addr.port}`);
  api = createAuthFetch(`http://${addr.address}:${addr.port}`, auth);
  organizationId = auth.orgId;

  const otherOrg = await db.organization.create({
    data: { name: '外部组织', slug: `llm-other-${Date.now()}` }
  });

  const now = Date.now();
  const rows = [
    {
      organizationId,
      providerName: 'openai',
      model: 'deepseek-chat',
      operation: 'prospect_scoring',
      status: 'success',
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      durationMs: 1200,
      createdAt: new Date(now - 3600_000)
    },
    {
      organizationId,
      providerName: 'openai',
      model: 'deepseek-chat',
      operation: 'prospect_scoring',
      status: 'success',
      promptTokens: 800,
      completionTokens: 200,
      totalTokens: 1000,
      durationMs: 800,
      createdAt: new Date(now - 7200_000)
    },
    {
      organizationId,
      providerName: 'openai',
      model: 'deepseek-chat',
      operation: 'prospect_scoring',
      status: 'failed',
      errorCode: 'quota',
      errorMessage: '402 Insufficient Balance',
      durationMs: 567,
      createdAt: new Date(now - 1800_000)
    },
    {
      organizationId,
      providerName: 'openai',
      model: 'deepseek-chat',
      operation: 'prospect_scoring',
      status: 'success',
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      durationMs: 100,
      createdAt: new Date(now - 40 * 86_400_000) // 40 天前：days=30 不可见
    },
    {
      organizationId: otherOrg.id,
      providerName: 'openai',
      model: 'gpt-4o-mini',
      operation: 'prospect_scoring',
      status: 'success',
      promptTokens: 9999,
      completionTokens: 9999,
      totalTokens: 19998,
      durationMs: 1,
      createdAt: new Date(now - 60_000)
    }
  ];
  for (const row of rows) {
    await db.providerRunLog.create({
      data: { providerVersion: 'v1', ...row } as never
    });
  }
});

afterAll(async () => {
  await db.$disconnect();
});

describe('LLM 用量聚合', () => {
  it('按模型聚合调用/失败/token，最近失败可见，组织隔离与天数过滤生效', async () => {
    const res = await api.get('/api/analytics/llm-usage?days=30');
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const byModel = res.body.byModel as Array<Record<string, unknown>>;
    expect(byModel).toHaveLength(1); // 外部组织与他模型不可见
    const m = byModel[0];
    expect(m).toMatchObject({
      provider: 'openai',
      model: 'deepseek-chat',
      calls: 3,
      failures: 1,
      promptTokens: 1800,
      completionTokens: 700,
      totalTokens: 2500
    });
    expect(m.lastError).toMatchObject({ code: 'quota' });
    expect(res.body.lastError).toMatchObject({ code: 'quota' });
  });

  it('数据库层：无数据的组织返回空聚合', async () => {
    const empty = await getLlmUsageSummary(
      db,
      '00000000-0000-4000-8000-000000000001',
      30
    );
    expect(empty.byModel).toHaveLength(0);
    expect(empty.lastError).toBeNull();
  });
});

describe('LLM 健康告警去重', () => {
  it('同组织同错误码当日只发一条通知，内容含指引', async () => {
    await notifyLlmHealthIssue(db, {
      organizationId,
      errorCode: 'quota',
      message: '402 Insufficient Balance'
    });
    await notifyLlmHealthIssue(db, {
      organizationId,
      errorCode: 'quota',
      message: '402 Insufficient Balance (again)'
    });

    const notifications = await db.notification.findMany({
      where: { organizationId, type: 'llm_health' }
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].level).toBe('critical');
    expect(notifications[0].actionUrl).toBe('/integrations/llm');

    // 不同错误码不去重
    await notifyLlmHealthIssue(db, {
      organizationId,
      errorCode: 'auth',
      message: '401 Unauthorized'
    });
    const after = await db.notification.findMany({
      where: { organizationId, type: 'llm_health' }
    });
    expect(after).toHaveLength(2);
  });
});
