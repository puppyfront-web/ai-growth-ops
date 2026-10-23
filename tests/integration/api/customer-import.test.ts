import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { getTestAuth, createAuthFetch, type TestAuthContext } from '../../setup/test-auth';

let server: Server;
let baseUrl: string;
let api: ReturnType<typeof createAuthFetch>;
let auth: TestAuthContext;
const db = createDatabaseClient();

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address()!;
  baseUrl = `http://${(addr as Record<string, unknown>).address}:${(addr as Record<string, unknown>).port}`;
  auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);

  // 库内已有同邮箱客户，用于预览的邮箱重复检测
  await db.customer.create({
    data: {
      organizationId: auth.orgId,
      userId: auth.userId,
      displayName: '既有客户',
      phone: '13900139000',
      email: 'existing@example.com',
      company: '老客户公司',
      role: '采购',
      intent: '已成交',
      channel: 'website'
    }
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

const CSV = [
  '姓名,手机号,邮箱,IM账号,公司,职位,需求,渠道,备注',
  '张三,13800138001,Zhang@Example.COM,wx_zhangsan,张三贸易,老板,风扇批发,WhatsApp,广交会名片',
  '李四,13800138002,existing@example.com,,李四商行,经理,样品单,email,重复邮箱',
  '王五,13800138003,,tg_wangwu,王五电商,运营,直播供货,Telegram,'
].join('\n');

describe('客户 CSV 导入：询盘联系字段与新渠道', () => {
  it('preview 建议映射 email/imAccount 列，渠道别名归一化，邮箱重复标记 duplicate_in_db', async () => {
    const res = await api.post('/api/customers/import/preview', { csv: CSV });
    expect(res.status).toBe(200);
    const body = res.body as {
      suggestedMapping: Record<string, number | undefined>;
      rows: Array<{
        rowNumber: number;
        data: {
          channel: string;
          email?: string;
          imAccount?: string;
        };
        issues: string[];
      }>;
    };

    expect(body.suggestedMapping.email).toBeDefined();
    expect(body.suggestedMapping.imAccount).toBeDefined();

    const zhang = body.rows.find((r) => r.rowNumber === 2)!;
    expect(zhang.data.channel).toBe('whatsapp');
    expect(zhang.data.email).toBe('zhang@example.com');
    expect(zhang.data.imAccount).toBe('wx_zhangsan');
    expect(zhang.issues).not.toContain('duplicate_in_db');

    const li = body.rows.find((r) => r.rowNumber === 3)!;
    expect(li.data.channel).toBe('email');
    expect(li.issues).toContain('duplicate_in_db');

    const wang = body.rows.find((r) => r.rowNumber === 4)!;
    expect(wang.data.channel).toBe('telegram');
    expect(wang.data.imAccount).toBe('tg_wangwu');
  });

  it('execute 落库 email/imAccount 与新渠道，重复邮箱默认跳过', async () => {
    const res = await api.post('/api/customers/import', { csv: CSV });
    expect(res.status).toBe(201);
    const body = res.body as { created: number; skipped: number };
    expect(body.created).toBe(2);
    expect(body.skipped).toBe(1);

    const zhang = await db.customer.findFirst({
      where: { organizationId: auth.orgId, displayName: '张三' }
    });
    expect(zhang?.email).toBe('zhang@example.com');
    expect(zhang?.imAccount).toBe('wx_zhangsan');
    expect(zhang?.channel).toBe('whatsapp');

    const wang = await db.customer.findFirst({
      where: { organizationId: auth.orgId, displayName: '王五' }
    });
    expect(wang?.channel).toBe('telegram');
    expect(wang?.imAccount).toBe('tg_wangwu');

    const liCount = await db.customer.count({
      where: { organizationId: auth.orgId, displayName: '李四' }
    });
    expect(liCount).toBe(0);
  });
});
