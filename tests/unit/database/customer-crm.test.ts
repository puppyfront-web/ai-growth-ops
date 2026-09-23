import { describe, expect, it } from 'vitest';
import {
  buildPlatformUserKey,
  ensureCustomerFromInteraction,
  findCustomerByAcquisitionIdentity
} from '../../../packages/database/src/customer-crm.js';

type FakeCustomer = {
  id: string;
  organizationId: string;
  displayName: string;
  deletedAt: Date | null;
  metadata: Record<string, unknown>;
  tags: string[];
  [key: string]: unknown;
};

function createFakeCrmDb(seed: FakeCustomer[] = []) {
  const customers = [...seed];
  const activities: Array<Record<string, unknown>> = [];
  let seq = seed.length;

  return {
    customers,
    activities,
    customer: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const meta = where.metadata as
          | { path: string[]; equals: unknown }
          | undefined;
        return (
          customers.find((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (where.deletedAt === null && row.deletedAt) return false;
            if (meta?.path) {
              let current: unknown = row.metadata;
              for (const key of meta.path) {
                if (!current || typeof current !== 'object') return false;
                current = (current as Record<string, unknown>)[key];
              }
              return current === meta.equals;
            }
            return true;
          }) ?? null
        );
      },
      update: async ({
        where,
        data
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = customers.find((item) => item.id === where.id);
        if (!row) throw new Error('missing customer');
        Object.assign(row, data);
        return row;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const nested = data.activities as
          | { create?: Record<string, unknown> }
          | undefined;
        const row = {
          id: `cust-${++seq}`,
          deletedAt: null,
          tags: [],
          ...data,
          activities: undefined
        } as FakeCustomer;
        customers.push(row);
        if (nested?.create) {
          activities.push({ customerId: row.id, ...nested.create });
        }
        return row;
      }
    },
    customerActivity: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `act-${activities.length + 1}`, ...data };
        activities.push(row);
        return row;
      }
    },
    lead: {
      updateMany: async () => ({ count: 0 }),
      update: async () => ({})
    }
  };
}

describe('customer-crm', () => {
  it('buildPlatformUserKey combines platform and external id', () => {
    expect(buildPlatformUserKey('douyin', 'sec_uid_123')).toBe(
      'douyin:sec_uid_123'
    );
  });

  it('finds a prospect-converted customer from later interaction identity', async () => {
    const db = createFakeCrmDb([
      {
        id: 'cust-1',
        organizationId: 'org-1',
        displayName: '潜客张三',
        deletedAt: null,
        tags: ['获客转入'],
        metadata: {
          prospectUserKey: 'sec_uid_123',
          platformUserKey: 'douyin:sec_uid_123'
        }
      }
    ]);

    const found = await findCustomerByAcquisitionIdentity(db, 'org-1', {
      platform: 'douyin',
      externalUserId: 'sec_uid_123'
    });
    expect(found?.id).toBe('cust-1');
  });

  it('reuses the same customer when converting the same platform user twice', async () => {
    const db = createFakeCrmDb();
    const input = {
      organizationId: 'org-1',
      userId: 'user-1',
      interactionId: 'int-1',
      platform: 'douyin' as const,
      platformAccountId: 'acc-1',
      externalUserId: 'sec_uid_123',
      externalUserName: '张三',
      conversationId: 'conv-1',
      content: '想要报价',
      leadLevel: 'A',
      source: 'manual_convert' as const
    };

    const first = await ensureCustomerFromInteraction(db as never, input);
    const second = await ensureCustomerFromInteraction(db as never, {
      ...input,
      interactionId: 'int-2'
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.customer.id).toBe(first.customer.id);
    expect(db.customers).toHaveLength(1);
  });
});
