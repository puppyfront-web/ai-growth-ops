import { randomUUID } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  createDatabaseClient,
  createRepositories,
  resetDatabase,
  seedDatabase
} from '../../../packages/database/src';

describe('database repositories integration', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it('creates and reads back a user record', async () => {
    const db = createDatabaseClient();
    const repositories = createRepositories(db);

    const user = await repositories.users.create({
      email: `ops-${randomUUID()}@example.com`,
      name: 'Ops User'
    });

    const found = await repositories.users.getById(user.id);

    expect(found?.email).toBe(user.email);

    await db.$disconnect();
  });

  it('creates, updates, lists, and soft deletes core records', async () => {
    const db = createDatabaseClient();
    const repositories = createRepositories(db);
    const suffix = randomUUID();

    // Create user + org (schema now requires organizationId on most entities)
    const user = await repositories.users.create({
      email: `crud-${suffix}@example.com`,
      name: 'CRUD User'
    });
    const org = await db.organization.create({
      data: {
        name: `Test Org ${suffix}`,
        slug: `test-org-${suffix}`,
        status: 'active'
      }
    });
    await db.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: 'owner',
        status: 'active'
      }
    });

    const account = await repositories.platformAccounts.create({
      userId: user.id,
      organizationId: org.id,
      platform: 'xiaohongshu',
      name: `xhs-${suffix}`,
      mode: 'manual_confirm'
    });

    const project = await repositories.contentProjects.create({
      userId: user.id,
      organizationId: org.id,
      title: 'Launch Plan',
      description: 'Initial launch content'
    });

    const contentItem = await repositories.contentItems.create({
      userId: user.id,
      organizationId: org.id,
      projectId: project.id,
      type: 'text_image',
      title: 'Launch Post',
      body: 'Hello growth ops'
    });

    const variant = await repositories.contentVariants.create({
      userId: user.id,
      organizationId: org.id,
      contentItemId: contentItem.id,
      platform: 'xiaohongshu',
      contentType: 'text_image',
      title: 'Launch Post for XHS',
      body: 'Hello XHS'
    });

    const publishJob = await repositories.publishJobs.create({
      userId: user.id,
      organizationId: org.id,
      contentVariantId: variant.id,
      platformAccountId: account.id,
      platform: 'xiaohongshu',
      contentType: 'text_image',
      mode: 'manual_confirm'
    });

    const interaction = await repositories.interactions.create({
      userId: user.id,
      organizationId: org.id,
      platformAccountId: account.id,
      platform: 'xiaohongshu',
      publishJobId: publishJob.id,
      externalInteractionId: `comment-${suffix}`,
      externalUserId: `external-${suffix}`,
      externalUserName: 'Potential Lead',
      type: 'comment',
      content: '想了解价格'
    });

    const lead = await repositories.leads.create({
      userId: user.id,
      organizationId: org.id,
      sourcePlatform: 'xiaohongshu',
      sourceAccountId: account.id,
      sourceInteractionId: interaction.id,
      sourcePublishJobId: publishJob.id,
      externalUserId: `external-${suffix}`,
      externalUserName: 'Potential Lead',
      level: 'B'
    });

    const researchTask = await repositories.researchTasks.create({
      userId: user.id,
      organizationId: org.id,
      type: 'keyword_discovery',
      status: 'QUEUED',
      provider: 'mock'
    });

    const updatedLead = await repositories.leads.update(lead.id, {
      status: 'QUALIFIED',
      summary: 'Interested in pricing'
    });

    expect(updatedLead.status).toBe('QUALIFIED');
    expect(await repositories.publishJobs.getById(publishJob.id)).toMatchObject(
      {
        id: publishJob.id
      }
    );
    expect(
      await repositories.researchTasks.getById(researchTask.id)
    ).toMatchObject({
      id: researchTask.id
    });

    await repositories.contentProjects.softDelete(project.id);

    const activeProjects = await repositories.contentProjects.listActiveByUser(
      user.id
    );
    expect(activeProjects).toHaveLength(0);

    await db.$disconnect();
  });

  it('rejects duplicate platform interactions for the same account', async () => {
    const db = createDatabaseClient();
    const repositories = createRepositories(db);
    const suffix = randomUUID();

    const user = await repositories.users.create({
      email: `platform-${randomUUID()}@example.com`,
      name: 'Platform User'
    });
    const org = await db.organization.create({
      data: {
        name: `Platform Org ${suffix}`,
        slug: `platform-org-${suffix}`,
        status: 'active'
      }
    });

    const account = await repositories.platformAccounts.create({
      userId: user.id,
      organizationId: org.id,
      platform: 'douyin',
      name: `douyin-${randomUUID()}`,
      mode: 'manual_confirm'
    });

    await repositories.interactions.create({
      userId: user.id,
      organizationId: org.id,
      platformAccountId: account.id,
      platform: 'douyin',
      externalInteractionId: 'interaction-001',
      externalUserId: 'external-user-001',
      externalUserName: 'Test User',
      type: 'comment',
      content: '多少钱？'
    });

    await expect(
      repositories.interactions.create({
        userId: user.id,
        organizationId: org.id,
        platformAccountId: account.id,
        platform: 'douyin',
        externalInteractionId: 'interaction-001',
        externalUserId: 'external-user-002',
        externalUserName: 'Duplicate User',
        type: 'comment',
        content: '重复评论'
      })
    ).rejects.toThrow();

    await db.$disconnect();
  });

  it('seeds admin user with default organization', async () => {
    const db = createDatabaseClient();
    const repositories = createRepositories(db);

    await seedDatabase(db);

    const adminUser = await repositories.users.getByEmail(
      'admin@ai-growth-ops.local'
    );
    expect(adminUser).not.toBeNull();
    expect(adminUser!.role).toBe('admin');

    // Verify default organization was created
    const memberships = await db.organizationMember.findMany({
      where: { userId: adminUser!.id, status: 'active' },
      include: { organization: true }
    });
    expect(memberships.length).toBeGreaterThanOrEqual(1);
    expect(memberships[0].role).toBe('owner');

    await db.$disconnect();
  });
});
