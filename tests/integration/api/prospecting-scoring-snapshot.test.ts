import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  convertProspectToCustomer,
  createDatabaseClient,
  resetDatabase,
  seedDatabase,
  upsertProspectCandidate,
  type DatabaseClient,
  type ProspectScoringTelemetry
} from '@ai-growth-ops/database';
import { SCORING_VERSION } from '@ai-growth-ops/shared';

const db: DatabaseClient = createDatabaseClient();
let organizationId: string;
let userId: string;
let taskId: string;

function scoreFixture(overrides: Record<string, unknown> = {}) {
  return {
    relevanceScore: 78,
    leadLevel: 'B',
    intent: 'user_considering_purchase',
    summary: '正在对比工具报价',
    matchedKeywords: ['报价'],
    scoreSource: 'skill',
    personaTag: 'demand_seeker',
    audienceFit: 80,
    needStrength: 70,
    buyingIntent: 75,
    evidenceQuality: 65,
    ...overrides
  } as never;
}

function prospectFixture(userKey: string) {
  return {
    userKey,
    externalUserId: userKey.replace(/^.*:/, ''),
    userNickname: '快照用户',
    userHomepage: `https://example.com/user/${userKey}`,
    avatarUrl: null,
    sourceVideoTitle: '选型视频',
    evidence: [
      {
        content: '有没有报价单，想对比一下',
        sourceVideoTitle: '选型视频',
        sourceVideoUrl: 'https://example.com/v/1',
        publishedAt: null,
        likeCount: 1
      }
    ]
  } as never;
}

const telemetry: ProspectScoringTelemetry = {
  version: SCORING_VERSION,
  ruleScore: 55,
  semanticScore: 78,
  personaTag: 'demand_seeker',
  degraded: false
};

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

describe('评分快照埋点', () => {
  it('新建候选写入 metadata.scoring（版本/规则分/语义分/画像/降级标记）', async () => {
    await upsertProspectCandidate(db, {
      taskId,
      organizationId,
      platform: 'douyin',
      prospect: prospectFixture('douyin:snap-create'),
      score: scoreFixture(),
      attributions: [],
      existing: undefined,
      scoring: telemetry
    });

    const row = await db.prospectCandidate.findFirstOrThrow({
      where: { organizationId, userKey: 'douyin:snap-create' }
    });
    expect(row.metadata).toMatchObject({
      scoring: {
        version: SCORING_VERSION,
        ruleScore: 55,
        semanticScore: 78,
        personaTag: 'demand_seeker',
        degraded: false
      }
    });
  });

  it('低分更新保留旧快照，高分更新连同快照一起替换', async () => {
    const created = await upsertProspectCandidate(db, {
      taskId,
      organizationId,
      platform: 'douyin',
      prospect: prospectFixture('douyin:snap-merge'),
      score: scoreFixture({ relevanceScore: 80, matchedKeywords: ['报价'] }),
      attributions: [],
      existing: undefined,
      scoring: { ...telemetry, ruleScore: 60, semanticScore: 80 }
    });

    // 低分 + 新 telemetry：分数与快照都应保留旧值（existing 传完整行，贴近真实调用）
    await upsertProspectCandidate(db, {
      taskId,
      organizationId,
      platform: 'douyin',
      prospect: prospectFixture('douyin:snap-merge'),
      score: scoreFixture({ relevanceScore: 30, leadLevel: 'D' }),
      attributions: [],
      existing: created as never,
      scoring: { ...telemetry, ruleScore: 10, semanticScore: 30 }
    });
    let row = await db.prospectCandidate.findFirstOrThrow({
      where: { organizationId, userKey: 'douyin:snap-merge' }
    });
    expect(row.relevanceScore).toBe(80);
    expect((row.metadata as Record<string, unknown>).scoring).toMatchObject({
      semanticScore: 80
    });

    // 高分 + 新 telemetry：分数与快照都替换
    await upsertProspectCandidate(db, {
      taskId,
      organizationId,
      platform: 'douyin',
      prospect: prospectFixture('douyin:snap-merge'),
      score: scoreFixture({ relevanceScore: 92, matchedKeywords: ['报价', '多少钱'] }),
      attributions: [],
      existing: row as never,
      scoring: { ...telemetry, ruleScore: 61, semanticScore: 92 }
    });
    row = await db.prospectCandidate.findFirstOrThrow({
      where: { organizationId, userKey: 'douyin:snap-merge' }
    });
    expect(row.relevanceScore).toBe(92);
    expect((row.metadata as Record<string, unknown>).scoring).toMatchObject({
      semanticScore: 92
    });
  });

  it('转化时冻结 conversionSnapshot，保留其他 metadata 键，重复转化不覆盖', async () => {
    const seeded = await db.prospectCandidate.create({
      data: {
        prospectingTaskId: taskId,
        organizationId,
        platform: 'douyin',
        keyword: '报价',
        userKey: 'douyin:snap-convert',
        externalUserId: 'snap-convert',
        userNickname: '转化用户',
        userHomepage: 'https://example.com/user/snap-convert',
        content: '求报价',
        commentCount: 1,
        evidence: [
          {
            content: '求报价',
            sourceVideoTitle: 'v',
            sourceVideoUrl: 'u',
            publishedAt: null,
            likeCount: 0
          }
        ],
        relevanceScore: 71,
        leadLevel: 'B',
        personaTag: 'demand_seeker',
        summary: '想买',
        matchedKeywords: ['报价'],
        metadata: {
          scoring: { version: SCORING_VERSION, ruleScore: 50, semanticScore: 71, personaTag: 'demand_seeker', degraded: false },
          customKey: '别丢我'
        } as never
      }
    });

    await convertProspectToCustomer(db, seeded.id, organizationId, userId, {
      phone: '13800001111'
    });

    const row = await db.prospectCandidate.findUniqueOrThrow({
      where: { id: seeded.id }
    });
    const meta = row.metadata as Record<string, unknown>;
    expect(meta.customKey).toBe('别丢我');
    expect(meta.convertedAt).toBeTruthy();
    expect(meta.conversionSnapshot).toMatchObject({
      relevanceScore: 71,
      leadLevel: 'B',
      personaTag: 'demand_seeker',
      evidenceCount: 1,
      scoringVersion: SCORING_VERSION
    });
    const snapshot = meta.conversionSnapshot as Record<string, unknown>;
    expect(typeof snapshot.at).toBe('string');

    // 重复转化走既有互斥路径，快照不被改写
    await expect(
      convertProspectToCustomer(db, seeded.id, organizationId, userId, {})
    ).rejects.toThrow(/已转入客户库/);
    const after = await db.prospectCandidate.findUniqueOrThrow({
      where: { id: seeded.id }
    });
    expect((after.metadata as Record<string, unknown>).conversionSnapshot).toEqual(
      snapshot
    );
  });
});
