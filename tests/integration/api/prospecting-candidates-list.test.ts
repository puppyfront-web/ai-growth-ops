import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { createAuthFetch, getTestAuth } from '../../setup/test-auth';

const db = createDatabaseClient();
let server: Server;
let api: ReturnType<typeof createAuthFetch>;
let auth: Awaited<ReturnType<typeof getTestAuth>>;
let taskId: string;
let otherOrgTaskId: string;
let candidateIds: Record<string, string> = {};

interface SeedCandidate {
  key: string;
  nickname: string;
  content: string;
  score: number;
  level: string;
  converted: boolean;
}

const seedCandidates: SeedCandidate[] = [
  {
    key: 'c1',
    nickname: '张老板',
    content: '我们准备采购一套私域工具',
    score: 90,
    level: 'A',
    converted: true
  },
  {
    key: 'c2',
    nickname: '李经理',
    content: '这个多少钱，求报价',
    score: 80,
    level: 'B',
    converted: false
  },
  {
    key: 'c3',
    nickname: '王老师',
    content: '也在考察同类产品',
    score: 70,
    level: 'A',
    converted: false
  },
  {
    key: 'c4',
    nickname: '赵师傅',
    content: '私域工具怎么选有人教吗',
    score: 60,
    level: 'C',
    converted: false
  },
  {
    key: 'c5',
    nickname: '孙同学',
    content: '围观一下',
    score: 50,
    level: 'D',
    converted: false
  },
  {
    key: 'c6',
    nickname: '周主管',
    content: '之前用过别家，想换',
    score: 40,
    level: 'B',
    converted: true
  }
];

async function createTaskWithCandidates(organizationId: string, userId: string) {
  const ids: Record<string, string> = {};
  const task = await db.prospectingTask.create({
    data: {
      organizationId,
      userId,
      platform: 'douyin',
      keywords: [],
      requirement: '寻找私域工具采购意向用户',
      status: 'completed',
      totalCandidates: seedCandidates.length
    }
  });
  for (const seed of seedCandidates) {
    let customerId: string | null = null;
    if (seed.converted) {
      const customer = await db.customer.create({
        data: {
          organizationId,
          userId,
          displayName: `${seed.nickname}的公司`,
          phone: '13800000000',
          company: '测试公司',
          role: '负责人',
          intent: 'evaluating'
        }
      });
      customerId = customer.id;
    }
    const candidate = await db.prospectCandidate.create({
      data: {
        prospectingTaskId: task.id,
        organizationId,
        platform: 'douyin',
        keyword: '',
        userKey: `${task.id}-${seed.key}`,
        externalUserId: `ext-${seed.key}`,
        userNickname: seed.nickname,
        userHomepage: `https://example.com/user/${seed.key}`,
        avatarUrl: null,
        content: seed.content,
        commentCount: 1,
        evidence: [
          {
            content: seed.content,
            sourceVideoTitle: '选型攻略',
            sourceVideoUrl: 'https://example.com/video/1',
            publishedAt: null,
            likeCount: 0
          }
        ],
        sourceVideoTitle: '选型攻略',
        sourceVideoUrl: 'https://example.com/video/1',
        relevanceScore: seed.score,
        leadLevel: seed.level,
        customerId
      }
    });
    ids[seed.key] = candidate.id;
  }
  return { taskId: task.id, candidateIds: ids };
}

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { address: string; port: number };
  const baseUrl = `http://${address.address}:${address.port}`;
  auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);

  const mainOrg = await createTaskWithCandidates(auth.orgId, auth.userId);
  taskId = mainOrg.taskId;
  candidateIds = mainOrg.candidateIds;

  // 另一个组织的同构任务，用于组织隔离断言。
  const otherOrg = await db.organization.create({
    data: { name: '其他组织', slug: 'other-org' }
  });
  const otherUser = await db.user.create({
    data: { email: 'other-org-user@ai-growth-ops.local', name: '其他组织用户' }
  });
  await db.organizationMember.create({
    data: {
      organizationId: otherOrg.id,
      userId: otherUser.id,
      role: 'owner',
      status: 'active'
    }
  });
  otherOrgTaskId = (
    await createTaskWithCandidates(otherOrg.id, otherUser.id)
  ).taskId;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

function scoresOf(body: unknown): number[] {
  const items = (body as { items: { relevanceScore: number }[] }).items;
  return items.map((item) => item.relevanceScore);
}

describe('GET /api/prospecting/tasks/:id/candidates', () => {
  it('分页返回按相关度降序的潜客', async () => {
    const response = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?page=1&pageSize=2`
    );
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);
    expect(scoresOf(response.body)).toEqual([90, 80]);
    expect(response.body.total).toBe(6);
    expect(response.body.totalPages).toBe(3);
    expect(response.body.page).toBe(1);
    expect(response.body.pageSize).toBe(2);
    expect(response.body.convertedCount).toBe(2);

    const page3 = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?page=3&pageSize=2`
    );
    expect(page3.status).toBe(200);
    expect(scoresOf(page3.body)).toEqual([50, 40]);
  });

  it('默认每页 20 条，含全量排序', async () => {
    const response = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates`
    );
    expect(response.status).toBe(200);
    expect(response.body.pageSize).toBe(20);
    expect(response.body.items).toHaveLength(6);
    expect(scoresOf(response.body)).toEqual([90, 80, 70, 60, 50, 40]);
  });

  it('minScore 过滤', async () => {
    const response = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?minScore=70`
    );
    expect(response.status).toBe(200);
    expect(scoresOf(response.body)).toEqual([90, 80, 70]);
    expect(response.body.total).toBe(3);
  });

  it('leadLevel 过滤', async () => {
    const response = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?leadLevel=A`
    );
    expect(response.status).toBe(200);
    expect(scoresOf(response.body)).toEqual([90, 70]);
    expect(response.body.total).toBe(2);
  });

  it('converted 过滤且 convertedCount 保持任务级', async () => {
    const yes = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?converted=yes`
    );
    expect(yes.status).toBe(200);
    expect(scoresOf(yes.body)).toEqual([90, 40]);
    expect(yes.body.convertedCount).toBe(2);

    const no = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?converted=no`
    );
    expect(no.status).toBe(200);
    expect(scoresOf(no.body)).toEqual([80, 70, 60, 50]);
    expect(no.body.convertedCount).toBe(2);
  });

  it('q 匹配昵称与评论内容', async () => {
    const byNickname = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?q=${encodeURIComponent('李')}`
    );
    expect(byNickname.status).toBe(200);
    expect(scoresOf(byNickname.body)).toEqual([80]);

    const byContent = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?q=${encodeURIComponent('采购')}`
    );
    expect(byContent.status).toBe(200);
    expect(scoresOf(byContent.body)).toEqual([90]);

    const none = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?q=${encodeURIComponent('不存在的关键词')}`
    );
    expect(none.status).toBe(200);
    expect(none.body.items).toHaveLength(0);
    expect(none.body.total).toBe(0);
  });

  it('组合筛选：minScore + leadLevel', async () => {
    const response = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?minScore=35&leadLevel=B`
    );
    expect(response.status).toBe(200);
    expect(scoresOf(response.body)).toEqual([80, 40]);
  });

  it('focusId 定位到潜客所在页', async () => {
    const response = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?page=1&pageSize=2&focusId=${candidateIds.c6}`
    );
    expect(response.status).toBe(200);
    expect(response.body.page).toBe(3);
    expect(response.body.focusResolved).toBe(candidateIds.c6);
    expect(scoresOf(response.body)).toEqual([50, 40]);
  });

  it('focusId 不存在时忽略并按请求页返回', async () => {
    const response = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?page=1&pageSize=2&focusId=not-a-candidate`
    );
    expect(response.status).toBe(200);
    expect(response.body.page).toBe(1);
    expect(response.body.focusResolved).toBeUndefined();
    expect(scoresOf(response.body)).toEqual([90, 80]);
  });

  it('focusId 被当前筛选排除时忽略', async () => {
    const response = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?minScore=70&focusId=${candidateIds.c6}`
    );
    expect(response.status).toBe(200);
    expect(response.body.focusResolved).toBeUndefined();
    expect(response.body.total).toBe(3);
  });

  it('任务详情不再内嵌 candidates', async () => {
    const response = await api.get(`/api/prospecting/tasks/${taskId}`);
    expect(response.status).toBe(200);
    expect(response.body.candidates).toBeUndefined();
  });

  it('拒绝无效参数', async () => {
    const badLevel = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?leadLevel=X`
    );
    expect(badLevel.status).toBe(400);

    const badScore = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?minScore=101`
    );
    expect(badScore.status).toBe(400);
  });

  it('未登录返回 401', async () => {
    const address = server.address() as { address: string; port: number };
    const res = await fetch(
      `http://${address.address}:${address.port}/api/prospecting/tasks/${taskId}/candidates`
    );
    expect(res.status).toBe(401);
  });

  it('无 research:view 权限返回 403', async () => {
    const membership = await db.organizationMember.findFirstOrThrow({
      where: { organizationId: auth.orgId, userId: auth.userId }
    });
    await db.organizationMember.update({
      where: { id: membership.id },
      data: { role: 'guest' }
    });
    try {
      const response = await api.get(
        `/api/prospecting/tasks/${taskId}/candidates`
      );
      expect(response.status).toBe(403);
    } finally {
      await db.organizationMember.update({
        where: { id: membership.id },
        data: { role: membership.role }
      });
    }
  });

  it('跨组织任务返回 404', async () => {
    const response = await api.get(
      `/api/prospecting/tasks/${otherOrgTaskId}/candidates`
    );
    expect(response.status).toBe(404);
  });
});
