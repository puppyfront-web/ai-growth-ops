import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  completeOutreachTouch,
  createDatabaseClient,
  createExperiment,
  createOutreachSequence,
  enrollCustomerInSequence,
  resetDatabase,
  recordLeadConversionForPublishJob,
  seedDatabase,
  startExperiment
} from '@ai-growth-ops/database';
import { createApiServer } from '../../apps/api/src';
import { createAuthFetch, getTestAuth } from '../setup/test-auth';

const db = createDatabaseClient();
let server: Server;
let api: ReturnType<typeof createAuthFetch>;
let baseUrl: string;
let organizationId: string;
let userId: string;

async function createContentFixture() {
  const project = await db.contentProject.create({
    data: { organizationId, userId, title: `项目-${randomUUID().slice(0, 6)}` }
  });
  const item = await db.contentItem.create({
    data: {
      organizationId,
      userId,
      projectId: project.id,
      type: 'text_image',
      title: `内容-${randomUUID().slice(0, 6)}`,
      status: 'ready'
    }
  });
  const variant = await db.contentVariant.create({
    data: {
      organizationId,
      userId,
      contentItemId: item.id,
      platform: 'douyin',
      contentType: 'text_image',
      title: item.title
    }
  });
  const account = await db.platformAccount.create({
    data: {
      organizationId,
      userId,
      platform: 'douyin',
      name: `账号-${randomUUID().slice(0, 6)}`,
      mode: 'browser_assist',
      status: 'active'
    }
  });
  return { item, variant, account };
}

async function createCustomer() {
  return db.customer.create({
    data: {
      organizationId,
      userId,
      displayName: `客户-${randomUUID().slice(0, 6)}`,
      phone: `13${Math.floor(Math.random() * 1e9)
        .toString()
        .padStart(9, '0')}`,
      company: '实验公司',
      role: '负责人',
      intent: '咨询',
      channel: 'douyin'
    }
  });
}

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { address: string; port: number };
  baseUrl = `http://${address.address}:${address.port}`;
  const auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);
  organizationId = auth.orgId;
  userId = auth.userId;
});

beforeEach(async () => {
  await db.experimentEvent.deleteMany();
  await db.experimentAssignment.deleteMany();
  await db.experiment.deleteMany();
  await db.outreachTouch.deleteMany();
  await db.outreachEnrollment.deleteMany();
  await db.outreachStep.deleteMany();
  await db.outreachSequence.deleteMany();
  await db.dealActivity.deleteMany();
  await db.deal.deleteMany();
  await db.lead.deleteMany({ where: { organizationId } });
  await db.customer.deleteMany({ where: { organizationId } });
  await db.publishJob.deleteMany({ where: { organizationId } });
  await db.contentVariant.deleteMany({ where: { organizationId } });
  await db.contentItem.deleteMany({ where: { organizationId } });
  await db.contentProject.deleteMany({ where: { organizationId } });
  await db.platformAccount.deleteMany({ where: { organizationId } });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

describe('experiment wiring', () => {
  it('assigns a content_item variant when a publish job is created', async () => {
    const experiment = await createExperiment(db, {
      organizationId,
      userId,
      name: '内容实验',
      metric: 'lead',
      variants: [
        { key: 'a', name: 'A', weight: 50 },
        { key: 'b', name: 'B', weight: 50 }
      ]
    });
    await startExperiment(db, experiment.id, organizationId);
    const { variant, account } = await createContentFixture();

    const created = await api.post('/api/publish-jobs', {
      contentItemId: variant.contentItemId,
      contentVariantId: variant.id,
      platformAccountId: account.id
    });
    expect(created.status).toBe(201);

    const assignment = await db.experimentAssignment.findUnique({
      where: {
        experimentId_entityType_entityId: {
          experimentId: experiment.id,
          entityType: 'content_item',
          entityId: variant.contentItemId
        }
      }
    });
    expect(assignment).toBeTruthy();
    expect(['a', 'b']).toContain(assignment!.variantKey);
  });

  it('assigns exactly once for batch publish', async () => {
    const experiment = await createExperiment(db, {
      organizationId,
      userId,
      name: '批量实验',
      metric: 'lead',
      variants: [
        { key: 'a', name: 'A', weight: 50 },
        { key: 'b', name: 'B', weight: 50 }
      ]
    });
    await startExperiment(db, experiment.id, organizationId);
    const { item, variant, account } = await createContentFixture();

    const first = await api.post('/api/publish-jobs/batch', {
      contentItemId: item.id,
      platformAccountIds: [account.id]
    });
    expect(first.status).toBe(201);
    const second = await api.post('/api/publish-jobs/batch', {
      contentItemId: item.id,
      platformAccountIds: [account.id]
    });
    expect(second.status).toBe(201);

    const assignments = await db.experimentAssignment.findMany({
      where: { experimentId: experiment.id }
    });
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.entityId).toBe(variant.contentItemId);
  });

  it('does not assign for draft experiments', async () => {
    await createExperiment(db, {
      organizationId,
      userId,
      name: '草稿实验',
      metric: 'lead',
      variants: [
        { key: 'a', name: 'A', weight: 50 },
        { key: 'b', name: 'B', weight: 50 }
      ]
    });
    const { variant, account } = await createContentFixture();

    const created = await api.post('/api/publish-jobs', {
      contentItemId: variant.contentItemId,
      contentVariantId: variant.id,
      platformAccountId: account.id
    });
    expect(created.status).toBe(201);
    expect(await db.experimentAssignment.count()).toBe(0);
  });

  it('assigns the customer when an outreach touch is sent but not skipped', async () => {
    const experiment = await createExperiment(db, {
      organizationId,
      userId,
      name: '触达实验',
      metric: 'won',
      variants: [
        { key: 'a', name: 'A', weight: 50 },
        { key: 'b', name: 'B', weight: 50 }
      ]
    });
    await startExperiment(db, experiment.id, organizationId);
    const customer = await createCustomer();
    const sequence = await createOutreachSequence(db, {
      organizationId,
      userId,
      name: '序列',
      channel: 'manual',
      steps: [{ order: 1, delayHours: 0, template: '{{name}}，你好' }]
    });
    const enrolled = await enrollCustomerInSequence(db, {
      organizationId,
      sequenceId: sequence.id,
      customerId: customer.id
    });

    const sent = await completeOutreachTouch(
      db,
      enrolled.touch!.id,
      organizationId,
      { status: 'sent' }
    );
    expect(sent.touch.status).toBe('sent');

    const assignment = await db.experimentAssignment.findUnique({
      where: {
        experimentId_entityType_entityId: {
          experimentId: experiment.id,
          entityType: 'customer',
          entityId: customer.id
        }
      }
    });
    expect(assignment).toBeTruthy();
  });

  it('records a won event when a deal is won and the metric matches', async () => {
    const wonExperiment = await createExperiment(db, {
      organizationId,
      userId,
      name: '成交实验',
      metric: 'won',
      variants: [
        { key: 'a', name: 'A', weight: 50 },
        { key: 'b', name: 'B', weight: 50 }
      ]
    });
    await startExperiment(db, wonExperiment.id, organizationId);
    const leadExperiment = await createExperiment(db, {
      organizationId,
      userId,
      name: '线索实验',
      metric: 'lead',
      variants: [
        { key: 'a', name: 'A', weight: 50 },
        { key: 'b', name: 'B', weight: 50 }
      ]
    });
    await startExperiment(db, leadExperiment.id, organizationId);

    const customer = await createCustomer();
    await db.experimentAssignment.createMany({
      data: [
        {
          experimentId: wonExperiment.id,
          organizationId,
          entityType: 'customer',
          entityId: customer.id,
          variantKey: 'a'
        },
        {
          experimentId: leadExperiment.id,
          organizationId,
          entityType: 'customer',
          entityId: customer.id,
          variantKey: 'a'
        }
      ]
    });

    const created = await api.post('/api/deals', {
      customerId: customer.id,
      title: '成交实验商机',
      stage: 'negotiation',
      amount: 1000
    });
    expect(created.status).toBe(201);
    const won = await api.put(`/api/deals/${created.body.id}`, {
      stage: 'won'
    });
    expect(won.status).toBe(200);

    const events = await db.experimentEvent.findMany({
      where: { experimentId: wonExperiment.id }
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.metric).toBe('won');

    const mismatched = await db.experimentEvent.findMany({
      where: { experimentId: leadExperiment.id }
    });
    expect(mismatched).toHaveLength(0);
  });

  it('records a lead event via the publish job of the converting interaction', async () => {
    const experiment = await createExperiment(db, {
      organizationId,
      userId,
      name: '线索归因实验',
      metric: 'lead',
      variants: [
        { key: 'a', name: 'A', weight: 50 },
        { key: 'b', name: 'B', weight: 50 }
      ]
    });
    await startExperiment(db, experiment.id, organizationId);
    const { item, variant, account } = await createContentFixture();
    const job = await db.publishJob.create({
      data: {
        organizationId,
        userId,
        contentVariantId: variant.id,
        platformAccountId: account.id,
        platform: 'douyin',
        contentType: 'text_image',
        mode: 'browser_assist',
        status: 'PUBLISHED',
        finishedAt: new Date()
      }
    });
    await db.experimentAssignment.create({
      data: {
        experimentId: experiment.id,
        organizationId,
        entityType: 'content_item',
        entityId: item.id,
        variantKey: 'a'
      }
    });

    const recorded = await recordLeadConversionForPublishJob(
      db,
      organizationId,
      job.id,
      'lead-1'
    );
    expect(recorded).toBe(1);

    const events = await db.experimentEvent.findMany({
      where: { experimentId: experiment.id }
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.metric).toBe('lead');

    // Idempotent for the same conversion: callers may retry safely.
    expect(
      await recordLeadConversionForPublishJob(db, organizationId, job.id, 'lead-1')
    ).toBe(0);
    // A different lead from the same content item counts as a new conversion.
    expect(
      await recordLeadConversionForPublishJob(db, organizationId, job.id, 'lead-2')
    ).toBe(1);
  });
});
