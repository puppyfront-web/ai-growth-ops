import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  findCustomerDuplicateGroups,
  findDuplicateCandidatesForCustomer,
  mergeCustomers,
  resetDatabase,
  seedDatabase,
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

async function customer(
  f: Fixture,
  overrides: Record<string, unknown> = {}
) {
  return f.db.customer.create({
    data: {
      organizationId: f.organizationId,
      userId: f.userId,
      displayName: `客户-${randomUUID().slice(0, 8)}`,
      phone: `13${Math.floor(Math.random() * 1e9)
        .toString()
        .padStart(9, '0')}`,
      company: '测试公司',
      role: '负责人',
      intent: '咨询',
      channel: 'douyin',
      ...overrides
    }
  });
}

describe('customer merge', () => {
  let f: Fixture;

  beforeEach(async () => {
    f = await fixture();
  });

  it('moves leads, deals, enrollments and submissions to the target', async () => {
    const target = await customer(f, { phone: '13800000010' });
    const source = await customer(f, {
      phone: '13800000010',
      tags: ['来源A']
    });
    await f.db.customer.update({
      where: { id: target.id },
      data: { tags: ['来源B'] }
    });
    const lead = await f.db.lead.create({
      data: {
        organizationId: f.organizationId,
        userId: f.userId,
        customerId: source.id,
        sourcePlatform: 'douyin',
        sourceAccountId: randomUUID(),
        externalUserId: randomUUID(),
        externalUserName: '线索',
        level: 'A',
        status: 'CONTACTED'
      }
    });
    const deal = await f.db.deal.create({
      data: {
        organizationId: f.organizationId,
        userId: f.userId,
        customerId: source.id,
        title: '商机',
        stage: 'qualified'
      }
    });
    const sequence = await f.db.outreachSequence.create({
      data: {
        organizationId: f.organizationId,
        userId: f.userId,
        name: '序列',
        channel: 'manual'
      }
    });
    const enrollment = await f.db.outreachEnrollment.create({
      data: {
        organizationId: f.organizationId,
        sequenceId: sequence.id,
        customerId: source.id
      }
    });
    const form = await f.db.leadCaptureForm.create({
      data: {
        organizationId: f.organizationId,
        userId: f.userId,
        name: '表单',
        slug: `form-${randomUUID().slice(0, 8)}`,
        title: '表单',
        fields: []
      }
    });
    const submission = await f.db.leadCaptureSubmission.create({
      data: {
        formId: form.id,
        organizationId: f.organizationId,
        name: '提交',
        phone: '13800000010',
        customerId: source.id
      }
    });

    const result = await mergeCustomers(f.db, {
      organizationId: f.organizationId,
      targetCustomerId: target.id,
      sourceCustomerId: source.id,
      operator: 'admin'
    });

    expect(result.target.id).toBe(target.id);
    expect(
      (
        await f.db.lead.findUniqueOrThrow({ where: { id: lead.id } })
      ).customerId
    ).toBe(target.id);
    expect(
      (
        await f.db.deal.findUniqueOrThrow({ where: { id: deal.id } })
      ).customerId
    ).toBe(target.id);
    expect(
      (
        await f.db.outreachEnrollment.findUniqueOrThrow({
          where: { id: enrollment.id }
        })
      ).customerId
    ).toBe(target.id);
    expect(
      (
        await f.db.leadCaptureSubmission.findUniqueOrThrow({
          where: { id: submission.id }
        })
      ).customerId
    ).toBe(target.id);

    const mergedTarget = await f.db.customer.findUniqueOrThrow({
      where: { id: target.id }
    });
    expect(mergedTarget.tags).toEqual(
      expect.arrayContaining(['来源A', '来源B'])
    );
    const mergedSource = await f.db.customer.findUniqueOrThrow({
      where: { id: source.id }
    });
    expect(mergedSource.deletedAt).not.toBeNull();

    const activities = await f.db.customerActivity.findMany({
      where: { customerId: target.id }
    });
    expect(activities.some((item) => item.action === 'merged_from_customer')).toBe(
      true
    );
  });

  it('rejects self-merge and cross-organization merge', async () => {
    const target = await customer(f);
    await expect(
      mergeCustomers(f.db, {
        organizationId: f.organizationId,
        targetCustomerId: target.id,
        sourceCustomerId: target.id
      })
    ).rejects.toThrow(/同一个客户/);

    const otherOrg = await f.db.organization.create({
      data: { name: '其他组织', slug: `other-${randomUUID()}` }
    });
    const foreign = await f.db.customer.create({
      data: {
        organizationId: otherOrg.id,
        userId: f.userId,
        displayName: '外部客户',
        phone: '13800000099',
        company: '外部',
        role: '负责人',
        intent: '咨询',
        channel: 'manual'
      }
    });
    await expect(
      mergeCustomers(f.db, {
        organizationId: f.organizationId,
        targetCustomerId: target.id,
        sourceCustomerId: foreign.id
      })
    ).rejects.toThrow(/不存在/);
  });

  it('finds duplicate groups and candidates', async () => {
    const first = await customer(f, { phone: '13800000011' });
    const second = await customer(f, { phone: '13800000011' });

    const groups = await findCustomerDuplicateGroups(
      f.db,
      f.organizationId
    );
    const phoneGroup = groups.find((group) => group.type === 'phone');
    expect(phoneGroup?.customers.map((item) => item.id).sort()).toEqual(
      [first.id, second.id].sort()
    );

    const candidates = await findDuplicateCandidatesForCustomer(
      f.db,
      first.id,
      f.organizationId
    );
    expect(candidates.map((item) => item.id)).toContain(second.id);
  });
});
