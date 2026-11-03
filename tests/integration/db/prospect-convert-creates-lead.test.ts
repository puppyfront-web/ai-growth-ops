import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  convertProspectToCustomer,
  createDatabaseClient,
  resetDatabase,
  seedDatabase,
  type DatabaseClient
} from '@ai-growth-ops/database';

const db: DatabaseClient = createDatabaseClient();
let organizationId: string;
let userId: string;
let taskId: string;

async function createCandidate(userKey: string, overrides: Record<string, unknown> = {}) {
  return db.prospectCandidate.create({
    data: {
      prospectingTaskId: taskId,
      organizationId,
      platform: 'douyin',
      keyword: '报价',
      userKey,
      externalUserId: userKey.replace(/^.*:/, ''),
      userNickname: `用户-${userKey.slice(-4)}`,
      content: '有没有报价单',
      relevanceScore: 70,
      leadLevel: 'B',
      metadata: { profile: null },
      ...overrides
    }
  });
}

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  const auth = await db.user.findFirstOrThrow({
    where: { email: 'admin@ai-growth-ops.local' },
    include: { organizationMemberships: true }
  });
  userId = auth.id;
  organizationId = auth.organizationMemberships[0].organizationId;
  const task = await db.prospectingTask.create({
    data: {
      organizationId,
      userId,
      platform: 'douyin',
      keywords: [],
      status: 'completed'
    }
  });
  taskId = task.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe('spec/53 T1+T3：潜客转化 → Lead 汇合与 lifecycle 同步', () => {
  it('转化成功后 ProspectCandidate.leadId 非空且 Lead 存在（组织隔离 + 去重键）', async () => {
    const candidate = await createCandidate(`douyin:t1-basic-${randomUUID().slice(0, 8)}`);
    const result = await convertProspectToCustomer(db, candidate.id, organizationId, userId, {
      displayName: '张三'
    });

    expect(result.leadId).toBeTruthy();

    const stored = await db.prospectCandidate.findFirstOrThrow({
      where: { id: candidate.id, organizationId }
    });
    expect(stored.leadId).toBe(result.leadId);

    const lead = await db.lead.findFirstOrThrow({
      where: { id: result.leadId, organizationId }
    });
    expect(lead.sourcePlatform).toBe('douyin');
    expect(lead.externalUserId).toBe(candidate.externalUserId);
    expect(lead.customerId).toBe(result.customer.id);
  });

  it('转化将 Lead 状态 NEW → QUALIFIED 并写入 LeadActivity', async () => {
    const candidate = await createCandidate(`douyin:t1-status-${randomUUID().slice(0, 8)}`);
    const result = await convertProspectToCustomer(db, candidate.id, organizationId, userId, {});

    const lead = await db.lead.findFirstOrThrow({
      where: { id: result.leadId, organizationId }
    });
    expect(lead.status).toBe('QUALIFIED');

    const activity = await db.leadActivity.findFirst({
      where: { leadId: lead.id, action: 'converted_from_prospect' }
    });
    expect(activity).toBeTruthy();
  });

  it('不降级：已 CONTACTED 的关联 Lead 转化后状态保持 CONTACTED', async () => {
    const externalUserId = `t1-contacted-${randomUUID().slice(0, 8)}`;
    // 预置一个互动侧 Lead（不同 sourceAccountId，同平台同外部用户）
    await db.lead.create({
      data: {
        organizationId,
        userId,
        sourcePlatform: 'douyin',
        sourceAccountId: `account-${randomUUID().slice(0, 8)}`,
        externalUserId,
        externalUserName: '互动用户',
        level: 'B',
        status: 'CONTACTED'
      }
    });
    const candidate = await createCandidate(`douyin:${externalUserId}`);
    const result = await convertProspectToCustomer(db, candidate.id, organizationId, userId, {});

    const lead = await db.lead.findFirstOrThrow({
      where: { id: result.leadId, organizationId }
    });
    expect(lead.status).toBe('CONTACTED');
    expect(lead.customerId).toBe(result.customer.id);
  });

  it('复用同平台同外部用户的既有 Lead，不重复建 Lead（漏斗汇合）', async () => {
    const externalUserId = `t1-dedup-${randomUUID().slice(0, 8)}`;
    const candidate = await createCandidate(`douyin:${externalUserId}`);
    await convertProspectToCustomer(db, candidate.id, organizationId, userId, {});

    // 同一外部用户的第二条潜客（不同 userKey、重新爬到）再次转化
    const second = await createCandidate(`douyin:t1-dedup2-${randomUUID().slice(0, 8)}`, {
      content: '第二条评论',
      metadata: {},
      externalUserId
    });
    const result2 = await convertProspectToCustomer(db, second.id, organizationId, userId, {});
    expect(result2.reused).toBe(true);

    const leadCount = await db.lead.count({
      where: { organizationId, sourcePlatform: 'douyin', externalUserId }
    });
    expect(leadCount).toBe(1);
    expect(result2.leadId).toBeTruthy();

    const stored = await db.prospectCandidate.findFirstOrThrow({
      where: { id: second.id, organizationId }
    });
    expect(stored.leadId).toBe(result2.leadId);
  });

  it('重复转化同一潜客报既有错误且不新建 Lead（幂等不重复建）', async () => {
    const candidate = await createCandidate(`douyin:t1-idem-${randomUUID().slice(0, 8)}`);
    const first = await convertProspectToCustomer(db, candidate.id, organizationId, userId, {});
    await expect(
      convertProspectToCustomer(db, candidate.id, organizationId, userId, {})
    ).rejects.toThrow(/已转入客户库/);

    const leadCount = await db.lead.count({
      where: { organizationId, externalUserId: candidate.externalUserId }
    });
    expect(leadCount).toBe(1);
    expect(first.leadId).toBeTruthy();
  });

  it('组织隔离：跨组织潜客不能被另一组织转化', async () => {
    const otherOrg = await db.organization.create({
      data: { name: '其他组织', slug: `other-${randomUUID().slice(0, 8)}` }
    });
    const otherTask = await db.prospectingTask.create({
      data: {
        organizationId: otherOrg.id,
        userId,
        platform: 'douyin',
        keywords: [],
        status: 'completed'
      }
    });
    const foreign = await db.prospectCandidate.create({
      data: {
        prospectingTaskId: otherTask.id,
        organizationId: otherOrg.id,
        platform: 'douyin',
        keyword: '报价',
        userKey: `douyin:t1-foreign-${randomUUID().slice(0, 8)}`,
        content: '外部潜客',
        relevanceScore: 10,
        leadLevel: 'C'
      }
    });

    await expect(
      convertProspectToCustomer(db, foreign.id, organizationId, userId, {})
    ).rejects.toThrow(/潜客不存在/);

    const stored = await db.prospectCandidate.findFirstOrThrow({
      where: { id: foreign.id }
    });
    expect(stored.customerId).toBeNull();
    expect(stored.leadId).toBeNull();
  });
});
