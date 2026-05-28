import { describe, expect, it } from 'vitest';

import {
  createDatabaseClient,
  resetDatabase
} from '../../../packages/database/src';
import {
  getCustomerDashboard,
  runCustomerDemoFlow
} from '../../../apps/api/src';

describe('customer seed flow', () => {
  it('runs demo flow and returns ok', async () => {
    const db = createDatabaseClient();

    try {
      await resetDatabase(db);

      const result = await runCustomerDemoFlow(db);
      expect(result.ok).toBe(true);

      const dashboard = await getCustomerDashboard(db);
      expect(dashboard.metrics.platformAccounts).toBe(6);
      expect(dashboard.metrics.contentItems).toBe(7);
      expect(dashboard.metrics.publishedJobs).toBe(1);
      expect(dashboard.metrics.interactions).toBe(6);
      expect(dashboard.metrics.qualifiedLeads).toBeGreaterThanOrEqual(1);
      expect(dashboard.metrics.researchInsights).toBe(3);
      expect(dashboard.metrics.contentOpportunities).toBe(2);
    } finally {
      await db.$disconnect();
    }
  });
});
