import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  mergeDuplicateProspectCandidates,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';

const db = createDatabaseClient();
let taskId: string;
let customerId: string;

const SEC_UID = 'MS4wLjABAAAAtestmerge1';
const HOMEPAGE = `https://www.douyin.com/user/${SEC_UID}`;

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  const org = await db.organization.findFirstOrThrow();
  const user = await db.user.findFirstOrThrow();
  const task = await db.prospectingTask.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      platform: 'douyin',
      keywords: ['宿舍风扇']
    }
  });
  taskId = task.id;

  const customer = await db.customer.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      displayName: '吃多多',
      phone: '13800138099',
      company: '待补充',
      role: '待补充',
      intent: '询盘',
      channel: 'douyin'
    }
  });
  customerId = customer.id;

  const base = {
    prospectingTaskId: taskId,
    organizationId: org.id,
    platform: 'douyin' as const,
    keyword: '宿舍风扇',
    leadLevel: 'B',
    scoreSource: 'rules'
  };

  // 行 A：结构化链路形态（数字 UID key、无客户归属、评分 70）
  await db.prospectCandidate.create({
    data: {
      ...base,
      userKey: '107716741825',
      externalUserId: '107716741825',
      userNickname: '吃多多',
      userHomepage: HOMEPAGE,
      content: '求推荐安静的宿舍风扇',
      commentCount: 1,
      evidence: [
        { content: '求推荐安静的宿舍风扇', sourceVideoTitle: null, sourceVideoUrl: null, publishedAt: null, likeCount: null }
      ],
      relevanceScore: 70
    }
  });
  // 行 B：DOM 链路形态（secUid key、已转客户、评分 90）
  await db.prospectCandidate.create({
    data: {
      ...base,
      userKey: SEC_UID,
      externalUserId: SEC_UID,
      userNickname: null,
      userHomepage: HOMEPAGE,
      content: '预算两百以内有吗',
      commentCount: 2,
      evidence: [
        { content: '预算两百以内有吗', sourceVideoTitle: null, sourceVideoUrl: null, publishedAt: null, likeCount: null },
        { content: '发货到广州吗', sourceVideoTitle: null, sourceVideoUrl: null, publishedAt: null, likeCount: null }
      ],
      relevanceScore: 90,
      customerId
    }
  });
    // 无关行：无主页，不受合并影响
    await db.prospectCandidate.create({
      data: {
        ...base,
        userKey: 'other-user',
        content: '其他用户评论内容',
        commentCount: 1,
        relevanceScore: 50
      }
    });
});

afterAll(async () => {
  await db.$disconnect();
});

describe('mergeDuplicateProspectCandidates', () => {
  it('同账号两行合并为一行：evidence 并集、评分取最高、customerId 保留', async () => {
    const before = await db.prospectCandidate.count({
      where: { prospectingTaskId: taskId }
    });
    expect(before).toBe(3);

    const result = await mergeDuplicateProspectCandidates(db, taskId);
    expect(result.groupsMerged).toBe(1);
    expect(result.removedRows).toBe(1);

    const after = await db.prospectCandidate.count({
      where: { prospectingTaskId: taskId }
    });
    expect(after).toBe(2);

    // 幸存行规则：有 customerId 的行优先（行 B），昵称等身份字段从被删行互补
    const survivor = await db.prospectCandidate.findFirstOrThrow({
      where: { prospectingTaskId: taskId, userKey: SEC_UID }
    });
    expect(survivor.customerId).toBe(customerId);
    expect(survivor.relevanceScore).toBe(90);
    expect(survivor.userNickname).toBe('吃多多');
    expect(survivor.commentCount).toBe(3);
    const evidence = survivor.evidence as Array<{ content: string }>;
    expect(evidence).toHaveLength(3);
    expect(evidence.map((e) => e.content)).toEqual(
      expect.arrayContaining([
        '求推荐安静的宿舍风扇',
        '预算两百以内有吗',
        '发货到广州吗'
      ])
    );
  });

  it('幂等：重复执行无变化', async () => {
    const result = await mergeDuplicateProspectCandidates(db, taskId);
    expect(result.groupsMerged).toBe(0);
    expect(result.removedRows).toBe(0);
    expect(
      await db.prospectCandidate.count({ where: { prospectingTaskId: taskId } })
    ).toBe(2);
  });
});
