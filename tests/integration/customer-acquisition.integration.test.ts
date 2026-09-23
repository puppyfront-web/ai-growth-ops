import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  convertProspectToCustomer,
  createDatabaseClient,
  ensureCustomerFromInteraction,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';

describe('customer acquisition identity', () => {
  it('reuses one customer across prospecting and comment conversion', async () => {
    const db = createDatabaseClient();
    try {
      await resetDatabase(db);
      await seedDatabase(db);
      const admin = await db.user.findFirstOrThrow({
        where: { email: 'admin@ai-growth-ops.local' }
      });
      const membership = await db.organizationMember.findFirstOrThrow({
        where: { userId: admin.id, status: 'active' }
      });
      const organizationId = membership.organizationId;
      const userKey = `sec_uid_${randomUUID().slice(0, 8)}`;

      const task = await db.prospectingTask.create({
        data: {
          organizationId,
          userId: admin.id,
          platform: 'douyin',
          keywords: ['企业获客']
        }
      });
      const candidate = await db.prospectCandidate.create({
        data: {
          prospectingTaskId: task.id,
          organizationId,
          platform: 'douyin',
          keyword: '企业获客',
          userKey,
          externalUserId: userKey,
          userNickname: 'E2E 潜客',
          content: '想了解报价',
          leadLevel: 'A',
          relevanceScore: 90
        }
      });

      const converted = await convertProspectToCustomer(
        db,
        candidate.id,
        organizationId,
        admin.id,
        { confirmDuplicate: true }
      );
      const linked = await ensureCustomerFromInteraction(db, {
        organizationId,
        userId: admin.id,
        interactionId: randomUUID(),
        platform: 'douyin',
        platformAccountId: randomUUID(),
        externalUserId: userKey,
        externalUserName: 'E2E 潜客',
        conversationId: randomUUID(),
        content: '私信继续问价格',
        leadLevel: 'A',
        source: 'manual_convert'
      });

      expect(linked.created).toBe(false);
      expect(linked.customer.id).toBe(converted.customer.id);
      const count = await db.customer.count({
        where: { organizationId, deletedAt: null }
      });
      expect(count).toBe(1);
    } finally {
      await db.$disconnect();
    }
  });
});
