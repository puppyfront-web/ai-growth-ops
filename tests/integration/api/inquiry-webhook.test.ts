import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { getTestAuth, type TestAuthContext } from '../../setup/test-auth';

let server: Server;
let baseUrl: string;
let auth: TestAuthContext;
const db = createDatabaseClient();
const TOKEN = 'test-inquiry-webhook-token';
const SLA_TOKEN = 'test-inquiry-sla-token';

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address()!;
  baseUrl = `http://${(addr as Record<string, unknown>).address}:${(addr as Record<string, unknown>).port}`;
  auth = await getTestAuth(db, baseUrl);

  await db.leadSourceConfig.create({
    data: {
      organizationId: auth.orgId,
      userId: auth.userId,
      name: '询盘接入测试',
      token: TOKEN,
      enabled: true
    }
  });
  // A 级 SLA（4 小时）来源，用于验证 defaultLevel 生效
  await db.leadSourceConfig.create({
    data: {
      organizationId: auth.orgId,
      userId: auth.userId,
      name: '询盘SLA测试',
      token: SLA_TOKEN,
      defaultLevel: 'A',
      enabled: true
    }
  });
  // 渠道 = whatsapp 的询盘固定分配给管理员，便于断言分配与通知
  await db.assignmentRule.create({
    data: {
      organizationId: auth.orgId,
      name: 'WhatsApp 询盘分配',
      priority: 10,
      conditions: { channel: 'whatsapp' },
      assigneeId: auth.userId,
      strategy: 'fixed',
      enabled: true
    }
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

function post(payload: unknown, token?: string) {
  return fetch(`${baseUrl}/api/inquiries/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-webhook-token': token } : {})
    },
    body: JSON.stringify(payload)
  });
}

describe('POST /api/inquiries/webhook', () => {
  it('缺少 token 返回 401，错误 token 返回 403', async () => {
    const noToken = await post({ name: 'Tom', email: 'tom@example.com' });
    expect(noToken.status).toBe(401);
    const badToken = await post({ name: 'Tom', email: 'tom@example.com' }, 'wrong-token');
    expect(badToken.status).toBe(403);
  });

  it('缺少姓名或全部联系方式缺失返回 400', async () => {
    const noName = await post({ email: 'nobody@example.com' }, TOKEN);
    expect(noName.status).toBe(400);
    const noContact = await post({ name: 'Tom' }, TOKEN);
    expect(noContact.status).toBe(400);
  });

  it('首次推送创建客户：渠道归一化、联系方式落库、分配与通知生效', async () => {
    const res = await post(
      {
        name: 'Tom Smith',
        channel: 'WhatsApp',
        email: 'Tom.Smith@Example.COM',
        company: 'Acme Ltd',
        message: 'Need 500 units of desk fans, quote please',
        country: 'US'
      },
      TOKEN
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; customerId: string; created: boolean };
    expect(body.ok).toBe(true);
    expect(body.created).toBe(true);

    const customer = await db.customer.findUnique({
      where: { id: body.customerId },
      include: { activities: true }
    });
    expect(customer).not.toBeNull();
    expect(customer!.channel).toBe('whatsapp');
    expect(customer!.email).toBe('tom.smith@example.com');
    expect(customer!.intent).toContain('desk fans');
    expect(customer!.assignedTo).toBe(auth.userId);
    expect(customer!.nextAction).toBe('首次联系');
    expect(
      customer!.activities.some((a) => a.action === 'inquiry_received')
    ).toBe(true);

    const notification = await db.notification.findFirst({
      where: { organizationId: auth.orgId, userId: auth.userId, actionUrl: `/customers/${body.customerId}` }
    });
    expect(notification).not.toBeNull();
  });

  it('同邮箱重复推送幂等：不新建客户，动态追加，联系方式可补齐', async () => {
    const before = await db.customer.count({ where: { organizationId: auth.orgId } });
    const res = await post(
      {
        name: 'Tom Smith',
        channel: 'email',
        email: 'tom.smith@example.com',
        imAccount: '@tom_smith'
      },
      TOKEN
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { customerId: string; created: boolean };
    expect(body.created).toBe(false);

    const after = await db.customer.count({ where: { organizationId: auth.orgId } });
    expect(after).toBe(before);

    const customer = await db.customer.findUnique({
      where: { id: body.customerId },
      include: { activities: true }
    });
    expect(customer!.imAccount).toBe('@tom_smith');
    expect(
      customer!.activities.filter((a) => a.action === 'inquiry_received').length
    ).toBeGreaterThanOrEqual(2);
  });

  it('手机号作为去重键：与既有表单客户按手机号合并', async () => {
    const first = await post(
      { name: '李四', channel: '微信', phone: '13800138000', message: '想了解批发价' },
      TOKEN
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { customerId: string; created: boolean };
    expect(firstBody.created).toBe(true);
    const customer = await db.customer.findUnique({ where: { id: firstBody.customerId } });
    expect(customer!.channel).toBe('wechat_personal');

    const second = await post(
      { name: '李四', channel: 'phone', phone: '138 0013 8000' },
      TOKEN
    );
    const secondBody = (await second.json()) as { customerId: string; created: boolean };
    expect(secondBody.created).toBe(false);
    expect(secondBody.customerId).toBe(firstBody.customerId);
  });

  it('来源 defaultLevel=A 时首次跟进 SLA 按 4 小时设置', async () => {
    const res = await post(
      { name: 'Sla User', channel: 'email', email: 'sla-user@example.com' },
      SLA_TOKEN
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { customerId: string };
    const customer = await db.customer.findUnique({ where: { id: body.customerId } });
    expect(customer!.nextActionAt).not.toBeNull();
    const hours = (customer!.nextActionAt!.getTime() - Date.now()) / 3_600_000;
    // A 级 SLA 为 4 小时；若误用默认 B 级会是 24 小时
    expect(hours).toBeGreaterThan(0);
    expect(hours).toBeLessThanOrEqual(4.5);
  });

  it('同一 IP 高频推送触发限流 429', async () => {
    let saw429 = false;
    for (let i = 0; i < 40 && !saw429; i++) {
      const res = await post({ name: 'Rate', email: `rate-${i}@example.com` }, TOKEN);
      if (res.status === 429) saw429 = true;
    }
    expect(saw429).toBe(true);
  });
});
