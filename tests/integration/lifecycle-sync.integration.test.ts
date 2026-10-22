import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase,
  syncCustomerOutcome,
  syncDealOutcome,
  syncLeadOutcome,
  type DatabaseClient
} from '@ai-growth-ops/database';

type Fixture = {
  db: DatabaseClient;
  userId: string;
  organizationId: string;
};

async function createFixture(): Promise<Fixture> {
  const db = createDatabaseClient();
  await resetDatabase(db);
  await seedDatabase(db);
  const admin = await db.user.findFirstOrThrow({
    where: { email: 'admin@ai-growth-ops.local' }
  });
  const membership = await db.organizationMember.findFirstOrThrow({
    where: { userId: admin.id, status: 'active' }
  });
  return {
    db,
    userId: admin.id,
    organizationId: membership.organizationId
  };
}

async function createCustomer(
  fixture: Fixture,
  overrides: { status?: 'active' | 'won' | 'lost' } = {}
) {
  return fixture.db.customer.create({
    data: {
      organizationId: fixture.organizationId,
      userId: fixture.userId,
      displayName: `客户-${randomUUID().slice(0, 8)}`,
      phone: `13${Math.floor(Math.random() * 1e9)
        .toString()
        .padStart(9, '0')}`,
      company: '测试公司',
      role: '负责人',
      intent: '咨询报价',
      channel: 'douyin',
      status: overrides.status ?? 'active'
    }
  });
}

async function createLead(
  fixture: Fixture,
  customerId: string | null,
  overrides: { status?: 'NEW' | 'CONTACTED' | 'WON' | 'LOST' } = {}
) {
  return fixture.db.lead.create({
    data: {
      organizationId: fixture.organizationId,
      userId: fixture.userId,
      customerId,
      sourcePlatform: 'douyin',
      sourceAccountId: randomUUID(),
      externalUserId: randomUUID(),
      externalUserName: '测试线索',
      level: 'A',
      status: overrides.status ?? 'CONTACTED',
      intent: '想了解报价'
    }
  });
}

async function createDeal(
  fixture: Fixture,
  customerId: string,
  overrides: {
    stage?: 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
    leadId?: string | null;
    amount?: number;
  } = {}
) {
  return fixture.db.deal.create({
    data: {
      organizationId: fixture.organizationId,
      userId: fixture.userId,
      customerId,
      leadId: overrides.leadId ?? null,
      title: `商机-${randomUUID().slice(0, 8)}`,
      stage: overrides.stage ?? 'qualified',
      amount: overrides.amount ?? 12000,
      sourceChannel: 'douyin'
    }
  });
}

describe('lifecycle outcome sync', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
  });

  it('mirrors a won lead to its customer and creates one won deal', async () => {
    const customer = await createCustomer(fixture);
    const lead = await createLead(fixture, customer.id);

    await syncLeadOutcome(fixture.db, lead.id, fixture.organizationId, 'won');
    await syncLeadOutcome(fixture.db, lead.id, fixture.organizationId, 'won');

    const refreshedLead = await fixture.db.lead.findUniqueOrThrow({
      where: { id: lead.id }
    });
    const refreshedCustomer = await fixture.db.customer.findUniqueOrThrow({
      where: { id: customer.id }
    });
    const deals = await fixture.db.deal.findMany({
      where: { customerId: customer.id }
    });

    expect(refreshedLead.status).toBe('WON');
    expect(refreshedCustomer.status).toBe('won');
    expect(deals).toHaveLength(1);
    expect(deals[0]?.stage).toBe('won');
    expect(deals[0]?.wonAt).not.toBeNull();
    expect(deals[0]?.closedAt).not.toBeNull();
  });

  it('mirrors a lost lead to its customer and open deals', async () => {
    const customer = await createCustomer(fixture);
    const lead = await createLead(fixture, customer.id);
    const deal = await createDeal(fixture, customer.id, {
      leadId: lead.id,
      stage: 'negotiation'
    });

    await syncLeadOutcome(fixture.db, lead.id, fixture.organizationId, 'lost', {
      lostReason: '预算不足'
    });

    const refreshedCustomer = await fixture.db.customer.findUniqueOrThrow({
      where: { id: customer.id }
    });
    const refreshedDeal = await fixture.db.deal.findUniqueOrThrow({
      where: { id: deal.id }
    });

    expect(refreshedCustomer.status).toBe('lost');
    expect(refreshedDeal.stage).toBe('lost');
    expect(refreshedDeal.lostReason).toBe('预算不足');
    expect(refreshedDeal.closedAt).not.toBeNull();
  });

  it('closes every open lead and deal when a customer is won', async () => {
    const customer = await createCustomer(fixture);
    const firstLead = await createLead(fixture, customer.id);
    const secondLead = await createLead(fixture, customer.id);
    const deal = await createDeal(fixture, customer.id, { stage: 'proposal' });

    await syncCustomerOutcome(
      fixture.db,
      customer.id,
      fixture.organizationId,
      'won'
    );

    const leads = await fixture.db.lead.findMany({
      where: { customerId: customer.id }
    });
    const refreshedDeal = await fixture.db.deal.findUniqueOrThrow({
      where: { id: deal.id }
    });

    expect(leads.map((lead) => lead.status).sort()).toEqual(['WON', 'WON']);
    expect(refreshedDeal.stage).toBe('won');
    expect(firstLead.id).not.toBe(secondLead.id);
  });

  it('mirrors a won deal to its customer and linked lead', async () => {
    const customer = await createCustomer(fixture);
    const lead = await createLead(fixture, customer.id);
    const deal = await createDeal(fixture, customer.id, {
      leadId: lead.id,
      stage: 'negotiation'
    });

    await syncDealOutcome(
      fixture.db,
      deal.id,
      fixture.organizationId,
      'won'
    );

    const refreshedCustomer = await fixture.db.customer.findUniqueOrThrow({
      where: { id: customer.id }
    });
    const refreshedLead = await fixture.db.lead.findUniqueOrThrow({
      where: { id: lead.id }
    });
    const refreshedDeal = await fixture.db.deal.findUniqueOrThrow({
      where: { id: deal.id }
    });

    expect(refreshedCustomer.status).toBe('won');
    expect(refreshedLead.status).toBe('WON');
    expect(refreshedDeal.stage).toBe('won');
    expect(refreshedDeal.wonAt).not.toBeNull();
  });

  it('reopens the customer and lead when a closed deal moves back to negotiation', async () => {
    const customer = await createCustomer(fixture, { status: 'won' });
    const lead = await createLead(fixture, customer.id, { status: 'WON' });
    const deal = await createDeal(fixture, customer.id, {
      leadId: lead.id,
      stage: 'won'
    });

    await syncDealOutcome(
      fixture.db,
      deal.id,
      fixture.organizationId,
      'negotiation',
      { reopenReason: '客户追加需求' }
    );

    const refreshedCustomer = await fixture.db.customer.findUniqueOrThrow({
      where: { id: customer.id }
    });
    const refreshedLead = await fixture.db.lead.findUniqueOrThrow({
      where: { id: lead.id }
    });
    const refreshedDeal = await fixture.db.deal.findUniqueOrThrow({
      where: { id: deal.id }
    });
    const activities = await fixture.db.dealActivity.findMany({
      where: { dealId: deal.id }
    });

    expect(refreshedCustomer.status).toBe('active');
    expect(refreshedLead.status).toBe('QUALIFIED');
    expect(refreshedDeal.stage).toBe('negotiation');
    expect(refreshedDeal.wonAt).toBeNull();
    expect(refreshedDeal.closedAt).toBeNull();
    expect(activities.some((activity) => activity.action === 'reopened')).toBe(
      true
    );
  });

  it('does not create a second deal when one is already closed', async () => {
    const customer = await createCustomer(fixture);
    const lead = await createLead(fixture, customer.id);
    const existing = await createDeal(fixture, customer.id, {
      leadId: lead.id,
      stage: 'won'
    });

    await syncLeadOutcome(fixture.db, lead.id, fixture.organizationId, 'won');

    const deals = await fixture.db.deal.findMany({
      where: { customerId: customer.id }
    });
    expect(deals).toHaveLength(1);
    expect(deals[0]?.id).toBe(existing.id);
  });

  it('aligns an existing opposite-outcome deal with the new outcome', async () => {
    const customer = await createCustomer(fixture);
    const lead = await createLead(fixture, customer.id);
    const existing = await createDeal(fixture, customer.id, {
      leadId: lead.id,
      stage: 'lost'
    });

    await syncLeadOutcome(fixture.db, lead.id, fixture.organizationId, 'won');

    const deals = await fixture.db.deal.findMany({
      where: { customerId: customer.id }
    });
    expect(deals).toHaveLength(1);
    expect(deals[0]?.id).toBe(existing.id);
    expect(deals[0]?.stage).toBe('won');
    expect(deals[0]?.wonAt).not.toBeNull();
  });

  it('rejects records from another organization', async () => {
    const customer = await createCustomer(fixture);
    const lead = await createLead(fixture, customer.id);
    const otherOrganization = await fixture.db.organization.create({
      data: { name: '另一个组织', slug: `other-${randomUUID()}` }
    });

    await expect(
      syncLeadOutcome(
        fixture.db,
        lead.id,
        otherOrganization.id,
        'won'
      )
    ).rejects.toThrow('线索不存在');
  });
});
