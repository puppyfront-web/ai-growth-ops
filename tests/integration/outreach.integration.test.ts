import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addOutreachSuppression,
  cancelOutreachEnrollment,
  completeOutreachTouch,
  createDatabaseClient,
  createOutreachSequence,
  enrollCustomerInSequence,
  escalateOverdueFollowUps,
  listDueOutreachTouches,
  pauseOutreachEnrollment,
  resetDatabase,
  resumeOutreachEnrollment,
  scanOutreach,
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

async function createCustomer(f: Fixture) {
  return f.db.customer.create({
    data: {
      organizationId: f.organizationId,
      userId: f.userId,
      displayName: '张总',
      phone: '13800000001',
      company: 'Acme',
      role: '负责人',
      intent: '私域运营',
      channel: 'douyin'
    }
  });
}

async function createSequence(f: Fixture, delays = [0, 24]) {
  return createOutreachSequence(f.db, {
    organizationId: f.organizationId,
    userId: f.userId,
    name: '新客三步触达',
    channel: 'manual',
    steps: delays.map((delayHours, index) => ({
      order: index + 1,
      delayHours,
      template: `第 ${index + 1} 步：{{name}}，{{company}}的{{intent}}`
    }))
  });
}

describe('outreach sequences and touches', () => {
  let f: Fixture;

  beforeEach(async () => {
    f = await fixture();
  });

  it('creates a sequence and enrolls a customer with the first touch', async () => {
    const customer = await createCustomer(f);
    const sequence = await createSequence(f);

    const result = await enrollCustomerInSequence(f.db, {
      organizationId: f.organizationId,
      sequenceId: sequence.id,
      customerId: customer.id
    });

    expect(result.created).toBe(true);
    expect(result.enrollment.status).toBe('active');
    expect(result.touch?.channel).toBe('manual');
    expect(result.touch?.content).toContain('张总');
    expect(result.touch?.content).toContain('Acme');
    expect(result.touch?.status).toBe('due');
  });

  it('returns the existing active enrollment instead of duplicating it', async () => {
    const customer = await createCustomer(f);
    const sequence = await createSequence(f);

    const first = await enrollCustomerInSequence(f.db, {
      organizationId: f.organizationId,
      sequenceId: sequence.id,
      customerId: customer.id
    });
    const second = await enrollCustomerInSequence(f.db, {
      organizationId: f.organizationId,
      sequenceId: sequence.id,
      customerId: customer.id
    });

    expect(second.created).toBe(false);
    expect(second.enrollment.id).toBe(first.enrollment.id);
    expect(
      await f.db.outreachEnrollment.count({
        where: { customerId: customer.id }
      })
    ).toBe(1);
  });

  it('schedules the next touch after a send and completes at the end', async () => {
    const customer = await createCustomer(f);
    const sequence = await createSequence(f, [0, 24]);
    const enrolled = await enrollCustomerInSequence(f.db, {
      organizationId: f.organizationId,
      sequenceId: sequence.id,
      customerId: customer.id
    });

    const sent = await completeOutreachTouch(
      f.db,
      enrolled.touch!.id,
      f.organizationId,
      { status: 'sent' }
    );

    expect(sent.touch.status).toBe('sent');
    expect(sent.nextTouch?.status).toBe('planned');
    expect(sent.enrollment.status).toBe('active');

    await completeOutreachTouch(
      f.db,
      sent.nextTouch!.id,
      f.organizationId,
      {
        status: 'sent',
        now: new Date(Date.now() + 25 * 60 * 60 * 1000)
      }
    );

    const enrollment = await f.db.outreachEnrollment.findUniqueOrThrow({
      where: { id: enrolled.enrollment.id }
    });
    expect(enrollment.status).toBe('completed');
    expect(enrollment.stopReason).toBe('completed');
  });

  it('stops the enrollment when the customer replies', async () => {
    const customer = await createCustomer(f);
    const sequence = await createSequence(f, [0, 24]);
    const enrolled = await enrollCustomerInSequence(f.db, {
      organizationId: f.organizationId,
      sequenceId: sequence.id,
      customerId: customer.id
    });

    const replied = await completeOutreachTouch(
      f.db,
      enrolled.touch!.id,
      f.organizationId,
      { status: 'replied' }
    );

    expect(replied.touch.status).toBe('replied');
    expect(replied.touch.repliedAt).not.toBeNull();
    expect(replied.enrollment.status).toBe('completed');
    expect(replied.enrollment.stopReason).toBe('replied');
    expect(replied.nextTouch).toBeNull();
  });

  it('blocks sends to suppressed customers and still allows skips', async () => {
    const customer = await createCustomer(f);
    const sequence = await createSequence(f, [0]);
    const enrolled = await enrollCustomerInSequence(f.db, {
      organizationId: f.organizationId,
      sequenceId: sequence.id,
      customerId: customer.id
    });
    await addOutreachSuppression(f.db, {
      organizationId: f.organizationId,
      type: 'customer',
      value: customer.id,
      reason: '客户要求不再联系'
    });

    await expect(
      completeOutreachTouch(f.db, enrolled.touch!.id, f.organizationId, {
        status: 'sent'
      })
    ).rejects.toThrow(/退订|黑名单/);

    const skipped = await completeOutreachTouch(
      f.db,
      enrolled.touch!.id,
      f.organizationId,
      { status: 'skipped' }
    );
    expect(skipped.touch.status).toBe('skipped');
  });

  it('enforces the daily touch cap across a customer', async () => {
    const customer = await createCustomer(f);
    const sequence = await createSequence(f, [0, 0]);
    const enrolled = await enrollCustomerInSequence(f.db, {
      organizationId: f.organizationId,
      sequenceId: sequence.id,
      customerId: customer.id
    });
    const first = await completeOutreachTouch(
      f.db,
      enrolled.touch!.id,
      f.organizationId,
      { status: 'sent' }
    );

    await expect(
      completeOutreachTouch(f.db, first.nextTouch!.id, f.organizationId, {
        status: 'sent'
      })
    ).rejects.toThrow(/上限/);
  });

  it('pauses, resumes and cancels an enrollment', async () => {
    const customer = await createCustomer(f);
    const sequence = await createSequence(f);
    const enrolled = await enrollCustomerInSequence(f.db, {
      organizationId: f.organizationId,
      sequenceId: sequence.id,
      customerId: customer.id
    });

    const paused = await pauseOutreachEnrollment(
      f.db,
      enrolled.enrollment.id,
      f.organizationId
    );
    expect(paused.status).toBe('paused');

    const resumed = await resumeOutreachEnrollment(
      f.db,
      enrolled.enrollment.id,
      f.organizationId
    );
    expect(resumed.status).toBe('active');

    const cancelled = await cancelOutreachEnrollment(
      f.db,
      enrolled.enrollment.id,
      f.organizationId,
      '客户明确拒绝'
    );
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.stopReason).toBe('客户明确拒绝');
  });

  it('lists due touches and marks overdue planned touches', async () => {
    const customer = await createCustomer(f);
    const sequence = await createSequence(f, [0]);
    await enrollCustomerInSequence(f.db, {
      organizationId: f.organizationId,
      sequenceId: sequence.id,
      customerId: customer.id
    });

    const due = await listDueOutreachTouches(f.db, f.organizationId);
    expect(due).toHaveLength(1);
    expect(due[0]?.enrollment.customer.displayName).toBe('张总');

    const scan = await scanOutreach(f.db, f.organizationId);
    expect(scan.markedDue).toBeGreaterThanOrEqual(1);
  });

  it('rejects cross-organization touch completion', async () => {
    const customer = await createCustomer(f);
    const sequence = await createSequence(f);
    const enrolled = await enrollCustomerInSequence(f.db, {
      organizationId: f.organizationId,
      sequenceId: sequence.id,
      customerId: customer.id
    });
    const otherOrg = await f.db.organization.create({
      data: { name: '其他组织', slug: `other-${randomUUID()}` }
    });

    await expect(
      completeOutreachTouch(
        f.db,
        enrolled.touch!.id,
        otherOrg.id,
        { status: 'sent' }
      )
    ).rejects.toThrow(/不存在/);
  });
});

describe('SLA escalation', () => {
  let f: Fixture;

  beforeEach(async () => {
    f = await fixture();
  });

  it('notifies once and records the escalation timestamp', async () => {
    const customer = await createCustomer(f);
    const lead = await f.db.lead.create({
      data: {
        organizationId: f.organizationId,
        userId: f.userId,
        customerId: customer.id,
        sourcePlatform: 'douyin',
        sourceAccountId: randomUUID(),
        externalUserId: randomUUID(),
        externalUserName: '超时线索',
        level: 'A',
        status: 'CONTACTED',
        assignedTo: f.userId,
        nextAction: '首次联系',
        nextActionAt: new Date('2026-01-01T00:00:00.000Z')
      }
    });

    const first = await escalateOverdueFollowUps(
      f.db,
      f.organizationId
    );
    const second = await escalateOverdueFollowUps(
      f.db,
      f.organizationId
    );

    expect(first.escalated).toBeGreaterThanOrEqual(1);
    expect(second.escalated).toBe(0);

    const refreshed = await f.db.lead.findUniqueOrThrow({
      where: { id: lead.id }
    });
    expect(refreshed.slaEscalatedAt).not.toBeNull();

    const notifications = await f.db.notification.findMany({
      where: {
        organizationId: f.organizationId,
        userId: f.userId,
        type: 'sla'
      }
    });
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    expect(notifications[0]?.actionUrl).toBe(`/leads/${lead.id}`);
  });
});
