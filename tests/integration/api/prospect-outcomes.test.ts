import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase,
  type DatabaseClient
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { createAuthFetch, getTestAuth } from '../../setup/test-auth';

const db: DatabaseClient = createDatabaseClient();
let api: ReturnType<typeof createAuthFetch>;
let organizationId: string;
let userId: string;
let taskId: string;

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
  userId = auth.userId;

  const task = await db.prospectingTask.create({
    data: { organizationId, userId, platform: 'douyin', keywords: [], status: 'completed' }
  });
  taskId = task.id;

  const mkCustomer = (name: string) =>
    db.customer.create({
      data: {
        organizationId,
        userId,
        displayName: name,
        phone: '13800000000',
        company: '测试公司',
        role: '负责人',
        intent: 'evaluating',
        channel: 'douyin'
      }
    });

  const mkDeal = (customerId: string, stage: 'won' | 'lost' | 'new') =>
    db.deal.create({
      data: {
        organizationId,
        userId,
        customerId,
        title: `商机-${stage}`,
        amount: 1000,
        stage
      }
    });

  // 转化者 A：转化时刻快照 leadLevel=A / demand_seeker，之后行值被改成 D——分组必须用快照
  const customerA = await mkCustomer('快照客户A');
  await mkDeal(customerA.id, 'won');
  await db.prospectCandidate.create({
    data: {
      prospectingTaskId: taskId,
      organizationId,
      platform: 'douyin',
      keyword: '',
      userKey: 'douyin:outcome-a',
      externalUserId: 'outcome-a',
      userNickname: '快照A',
      content: '求报价',
      commentCount: 1,
      evidence: [],
      relevanceScore: 10,
      leadLevel: 'D',
      personaTag: 'practitioner',
      customerId: customerA.id,
      metadata: {
        scoring: { version: 2, ruleScore: 1, semanticScore: 92, personaTag: 'demand_seeker', degraded: false },
        conversionSnapshot: {
          at: new Date().toISOString(),
          relevanceScore: 92,
          leadLevel: 'A',
          personaTag: 'demand_seeker',
          summary: null,
          matchedKeywords: [],
          evidenceCount: 1,
          scoringVersion: 2
        }
      } as never
    }
  });

  // 转化者 B：无快照（历史行）——用当前行值 B / peer_vendor，未赢单
  const customerB = await mkCustomer('历史客户B');
  await db.prospectCandidate.create({
    data: {
      prospectingTaskId: taskId,
      organizationId,
      platform: 'douyin',
      keyword: '',
      userKey: 'douyin:outcome-b',
      externalUserId: 'outcome-b',
      userNickname: '历史B',
      content: '多少钱',
      commentCount: 1,
      evidence: [],
      relevanceScore: 70,
      leadLevel: 'B',
      personaTag: 'peer_vendor',
      customerId: customerB.id
    }
  });

  // 未转化者：A 级 demand_seeker ×1、C 级无画像 ×1
  await db.prospectCandidate.create({
    data: {
      prospectingTaskId: taskId,
      organizationId,
      platform: 'douyin',
      keyword: '',
      userKey: 'douyin:outcome-c',
      externalUserId: 'outcome-c',
      userNickname: '未转化C',
      content: '围观',
      commentCount: 1,
      evidence: [],
      relevanceScore: 85,
      leadLevel: 'A',
      personaTag: 'demand_seeker'
    }
  });
  await db.prospectCandidate.create({
    data: {
      prospectingTaskId: taskId,
      organizationId,
      platform: 'douyin',
      keyword: '',
      userKey: 'douyin:outcome-d',
      externalUserId: 'outcome-d',
      userNickname: '未转化D',
      content: '路过',
      commentCount: 1,
      evidence: [],
      relevanceScore: 40,
      leadLevel: 'C'
    }
  });
});

afterAll(async () => {
  await db.$disconnect();
});

describe('GET /api/analytics/prospect-outcomes', () => {
  it('快照口径优先：转化后行值变化不影响分组；赢单率与覆盖率正确', async () => {
    const res = await api.get('/api/analytics/prospect-outcomes?days=30');
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const byLevel = res.body.byLevel as Array<Record<string, unknown>>;
    const levelA = byLevel.find((r) => r.leadLevel === 'A');
    // A：快照 A 级 1 个（已转化+赢单）+ 未转化 A 级 1 个
    expect(levelA).toMatchObject({ candidates: 2, converted: 1, won: 1 });
    const levelB = byLevel.find((r) => r.leadLevel === 'B');
    expect(levelB).toMatchObject({ candidates: 1, converted: 1, won: 0 });
    // 行值被改成 D 的快照 A 不应计入 D
    const levelD = byLevel.find((r) => r.leadLevel === 'D');
    expect(levelD?.candidates ?? 0).toBe(0);

    const byPersona = res.body.byPersona as Array<Record<string, unknown>>;
    const demandSeeker = byPersona.find((r) => r.personaTag === 'demand_seeker');
    expect(demandSeeker).toMatchObject({ candidates: 2, converted: 1, won: 1 });
    const peer = byPersona.find((r) => r.personaTag === 'peer_vendor');
    expect(peer).toMatchObject({ candidates: 1, converted: 1, won: 0 });
    const unjudged = byPersona.find((r) => r.personaTag === 'unjudged');
    expect(unjudged).toMatchObject({ candidates: 1, converted: 0, won: 0 });

    expect(res.body.summary).toMatchObject({
      candidates: 4,
      converted: 2,
      won: 1
    });
    // 快照覆盖率：转化者 2 中 1 个有快照；全体 4 中 1 个有 scoring 快照
    expect(res.body.summary.conversionSnapshotCoverage).toBe(0.5);
  });

  it('数据库层：窗口外数据不计入', async () => {
    const old = await db.prospectCandidate.create({
      data: {
        prospectingTaskId: taskId,
        organizationId,
        platform: 'douyin',
        keyword: '',
        userKey: 'douyin:outcome-old',
        externalUserId: 'outcome-old',
        userNickname: '窗口外',
        content: '旧数据',
        commentCount: 1,
        evidence: [],
        relevanceScore: 90,
        leadLevel: 'A',
        createdAt: new Date(Date.now() - 60 * 86_400_000)
      }
    });
    const res = await api.get('/api/analytics/prospect-outcomes?days=30');
    const levelA = (res.body.byLevel as Array<Record<string, unknown>>).find(
      (r) => r.leadLevel === 'A'
    );
    expect(levelA).toMatchObject({ candidates: 2 }); // 窗口外的 A 级未计入
    await db.prospectCandidate.delete({ where: { id: old.id } });
  });
});
