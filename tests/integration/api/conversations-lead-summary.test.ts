import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { createToken } from '../../../apps/api/src/auth';
import { getTestAuth, createAuthFetch } from '../../setup/test-auth';

let server: Server;
let baseUrl: string;
let api: ReturnType<typeof createAuthFetch>;
const db = createDatabaseClient();

let orgId: string;
let adminId: string;
let accountId: string;
let conversationId: string;
let interactionWithLeadId: string;
let interactionWithoutLeadId: string;
let leadId: string;

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address()!;
  baseUrl = `http://${(addr as Record<string, unknown>).address}:${(addr as Record<string, unknown>).port}`;
  const auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);
  orgId = auth.orgId;

  const admin = await db.user.findFirstOrThrow({
    where: { email: 'admin@ai-growth-ops.local' }
  });
  adminId = admin.id;

  const account = await db.platformAccount.create({
    data: {
      organizationId: orgId,
      userId: adminId,
      platform: 'douyin',
      name: 'Lead Summary Test Account',
      mode: 'browser_assist',
      status: 'active'
    }
  });
  accountId = account.id;

  const conversation = await db.conversation.create({
    data: {
      organizationId: orgId,
      userId: adminId,
      platform: 'douyin',
      platformAccountId: accountId,
      externalUserId: 'lead-summary-user',
      externalUserName: '线索测试用户'
    }
  });
  conversationId = conversation.id;

  interactionWithLeadId = (
    await db.interaction.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        platform: 'douyin',
        platformAccountId: accountId,
        conversationId,
        externalInteractionId: `lead-sum-${Date.now()}-1`,
        externalUserId: 'lead-summary-user',
        externalUserName: '线索测试用户',
        type: 'comment',
        content: '求价格'
      }
    })
  ).id;

  interactionWithoutLeadId = (
    await db.interaction.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        platform: 'douyin',
        platformAccountId: accountId,
        conversationId,
        externalInteractionId: `lead-sum-${Date.now()}-2`,
        externalUserId: 'lead-summary-user',
        externalUserName: '线索测试用户',
        type: 'comment',
        content: '已购买过'
      }
    })
  ).id;

  const lead = await db.lead.create({
    data: {
      organizationId: orgId,
      userId: adminId,
      sourcePlatform: 'douyin',
      sourceAccountId: accountId,
      sourceInteractionId: interactionWithLeadId,
      externalUserId: 'lead-summary-user',
      externalUserName: '线索测试用户',
      level: 'B',
      status: 'NEW',
      metadata: { score: 82 }
    }
  });
  leadId = lead.id;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

describe('Conversation Detail Lead Summary API', () => {
  it('401: 未登录拒绝', async () => {
    const res = await fetch(`${baseUrl}/api/conversations/${conversationId}`);
    expect(res.status).toBe(401);
  });

  it('GET 会话详情返回关联线索摘要（按 interaction 关联）', async () => {
    const res = await api.get(`/api/conversations/${conversationId}`);
    expect(res.status).toBe(200);
    expect(res.body.leadSummary).toEqual(
      expect.objectContaining({
        id: leadId,
        status: 'NEW',
        name: '线索测试用户',
        source: 'douyin',
        score: 82
      })
    );
  });

  it('GET 用 interaction id 兜底查询也返回 leadSummary', async () => {
    const res = await api.get(`/api/conversations/${interactionWithLeadId}`);
    expect(res.status).toBe(200);
    expect(res.body.leadSummary).toEqual(
      expect.objectContaining({ id: leadId })
    );
  });

  it('跨组织访问返回 404，不泄露线索摘要', async () => {
    const otherOrg = await db.organization.create({
      data: {
        name: 'Lead Summary Other Org',
        slug: 'lead-summary-other-org',
        status: 'active'
      }
    });
    await db.organizationMember.create({
      data: {
        organizationId: otherOrg.id,
        userId: adminId,
        role: 'owner',
        status: 'active'
      }
    });
    const res = await fetch(`${baseUrl}/api/conversations/${conversationId}`, {
      headers: {
        Authorization: `Bearer ${createToken(adminId)}`,
        'X-Organization-Id': otherOrg.id
      }
    });
    expect(res.status).toBe(404);
  });

  it('无线索关联的互动不返回 leadSummary 字段', async () => {
    // 独立互动（无会话、无线索）→ 合成会话响应
    const standalone = await db.interaction.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        platform: 'douyin',
        platformAccountId: accountId,
        externalInteractionId: `lead-sum-${Date.now()}-3`,
        externalUserId: 'no-lead-user',
        externalUserName: '无线索用户',
        type: 'comment',
        content: '路过'
      }
    });
    const res = await api.get(`/api/conversations/${standalone.id}`);
    expect(res.status).toBe(200);
    expect(res.body.leadSummary).toBeUndefined();
    expect(res.body.interactions).toHaveLength(1);

    // 互动列表同样：有线索的条目带 leadSummary，无线索的不带
    const list = await api.get(
      `/api/interactions?page=1&pageSize=50&platform=douyin`
    );
    expect(list.status).toBe(200);
    const withLead = (list.body.items as Array<Record<string, unknown>>).find(
      (i) => i.id === interactionWithLeadId
    );
    const withoutLead = (
      list.body.items as Array<Record<string, unknown>>
    ).find((i) => i.id === interactionWithoutLeadId);
    expect(withLead?.leadSummary).toEqual(
      expect.objectContaining({ id: leadId })
    );
    expect(withoutLead).toBeTruthy();
    expect(withoutLead?.leadSummary).toBeUndefined();
  });
});
