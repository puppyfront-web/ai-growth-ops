import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyAssignmentRules,
  createAssignmentRule,
  createDatabaseClient,
  createLeadCaptureForm,
  resetDatabase,
  seedDatabase,
  submitLeadCaptureForm,
  type DatabaseClient
} from '@ai-growth-ops/database';

type Fixture = {
  db: DatabaseClient;
  userId: string;
  organizationId: string;
};

async function fixture(): Promise<Fixture> {
  const db = createDatabaseClient();
  await resetDatabase(db);
  await seedDatabase(db);
  const admin = await db.user.findFirstOrThrow({
    where: { email: 'admin@ai-growth-ops.local' }
  });
  const membership = await db.organizationMember.findFirstOrThrow({
    where: { userId: admin.id, status: 'active' }
  });
  return { db, userId: admin.id, organizationId: membership.organizationId };
}

async function createForm(f: Fixture, overrides: Record<string, unknown> = {}) {
  return createLeadCaptureForm(f.db, {
    organizationId: f.organizationId,
    userId: f.userId,
    name: '官网咨询',
    slug: `form-${randomUUID().slice(0, 8)}`,
    title: '获取方案',
    fields: [
      { key: 'name', label: '姓名', type: 'text', required: true },
      { key: 'phone', label: '手机号', type: 'tel', required: true }
    ],
    ...overrides
  });
}

describe('lead capture forms', () => {
  let f: Fixture;

  beforeEach(async () => {
    f = await fixture();
  });

  it('creates a customer, submission and notification', async () => {
    const form = await createForm(f);

    const result = await submitLeadCaptureForm(f.db, {
      slug: form.slug,
      name: '李女士',
      phone: '13900000001',
      company: 'Acme',
      message: '想了解私域方案'
    });

    expect(result.created).toBe(true);
    expect(result.customer.channel).toBe('website');
    expect(result.customer.tags).toEqual(
      expect.arrayContaining(['表单获客', '待跟进'])
    );
    expect(result.submission.customerId).toBe(result.customer.id);

    const notifications = await f.db.notification.findMany({
      where: { organizationId: f.organizationId, type: 'lead' }
    });
    expect(notifications.length).toBeGreaterThanOrEqual(1);
  });

  it('reuses an existing customer by normalized phone', async () => {
    const form = await createForm(f);

    const first = await submitLeadCaptureForm(f.db, {
      slug: form.slug,
      name: '李女士',
      phone: '139-0000-0002'
    });
    const second = await submitLeadCaptureForm(f.db, {
      slug: form.slug,
      name: '李女士',
      phone: '13900000002'
    });

    expect(second.created).toBe(false);
    expect(second.customer.id).toBe(first.customer.id);
    expect(
      await f.db.leadCaptureSubmission.count({
        where: { formId: form.id }
      })
    ).toBe(2);
  });

  it('rejects invalid phone and disabled forms', async () => {
    const form = await createForm(f);
    await expect(
      submitLeadCaptureForm(f.db, {
        slug: form.slug,
        name: '无效手机号',
        phone: '123'
      })
    ).rejects.toThrow(/手机号/);

    await f.db.leadCaptureForm.update({
      where: { id: form.id },
      data: { enabled: false }
    });
    await expect(
      submitLeadCaptureForm(f.db, {
        slug: form.slug,
        name: '停用表单',
        phone: '13900000003'
      })
    ).rejects.toThrow(/停用/);
  });

  it('applies a matching assignment rule', async () => {
    const assignee = await f.db.user.create({
      data: {
        email: `assignee-${randomUUID()}@example.com`,
        name: '销售 B',
        role: 'member'
      }
    });
    await f.db.organizationMember.create({
      data: {
        organizationId: f.organizationId,
        userId: assignee.id,
        role: 'member',
        status: 'active'
      }
    });
    await createAssignmentRule(f.db, {
      organizationId: f.organizationId,
      name: '官网表单给 B',
      priority: 1,
      conditions: { channel: 'website' },
      assigneeId: assignee.id
    });
    const form = await createForm(f);

    const result = await submitLeadCaptureForm(f.db, {
      slug: form.slug,
      name: '王先生',
      phone: '13900000004'
    });

    expect(result.customer.assignedTo).toBe(assignee.id);
    const notification = await f.db.notification.findFirst({
      where: { organizationId: f.organizationId, userId: assignee.id }
    });
    expect(notification).toBeTruthy();
  });

  it('falls back to the least loaded member when no rule matches', async () => {
    const assignee = await f.db.user.create({
      data: {
        email: `assignee-${randomUUID()}@example.com`,
        name: '销售 C',
        role: 'member'
      }
    });
    await f.db.organizationMember.create({
      data: {
        organizationId: f.organizationId,
        userId: assignee.id,
        role: 'member',
        status: 'active'
      }
    });
    const result = await applyAssignmentRules(
      f.db,
      f.organizationId,
      { channel: 'website' },
      'customer'
    );
    expect([f.userId, assignee.id]).toContain(result.assigneeId);
  });
});
