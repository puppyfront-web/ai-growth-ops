import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '../../../packages/database/src';
import { getCustomerDashboard } from '../../../apps/api/src';

describe('customer dashboard', () => {
  it('returns dashboard with seeded admin user data', async () => {
    const db = createDatabaseClient();

    try {
      await resetDatabase(db);
      await seedDatabase(db);

      const admin = await db.user.findFirstOrThrow({
        where: { email: 'admin@ai-growth-ops.local' }
      });

      const dashboard = await getCustomerDashboard(db, admin.id);

      // Freshly seeded DB should have 0 items (no demo data)
      expect(dashboard.metrics.platformAccounts).toBe(0);
      expect(dashboard.metrics.contentItems).toBe(0);
      expect(dashboard.metrics.publishedJobs).toBe(0);
      expect(dashboard.metrics.interactions).toBe(0);
      expect(dashboard.metrics.qualifiedLeads).toBe(0);

      // Dashboard should have array fields
      expect(Array.isArray(dashboard.recentPublishJobs)).toBe(true);
      expect(Array.isArray(dashboard.leadSummaries)).toBe(true);
      expect(Array.isArray(dashboard.insights)).toBe(true);
    } finally {
      await db.$disconnect();
    }
  });

  it('returns correct counts after creating records', async () => {
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

      // Create a platform account
      await db.platformAccount.create({
        data: {
          userId: admin.id,
          organizationId: membership.organizationId,
          platform: 'douyin',
          name: 'Test Account',
          mode: 'manual_confirm',
          status: 'active'
        }
      });

      // Create a content project first (required by ContentItem)
      const project = await db.contentProject.create({
        data: {
          userId: admin.id,
          organizationId: membership.organizationId,
          title: 'Test Project',
          description: 'Test project for dashboard'
        }
      });

      // Create a content item
      await db.contentItem.create({
        data: {
          userId: admin.id,
          organizationId: membership.organizationId,
          projectId: project.id,
          type: 'text_image',
          title: 'Test Content',
          body: 'Test body',
          status: 'draft'
        }
      });

      const dashboard = await getCustomerDashboard(db, admin.id);
      expect(dashboard.metrics.platformAccounts).toBe(1);
      expect(dashboard.metrics.contentItems).toBe(1);
    } finally {
      await db.$disconnect();
    }
  });
});
