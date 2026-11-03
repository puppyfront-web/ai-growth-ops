import { describe, expect, it } from 'vitest';
import {
  blockInteractionTarget,
  unblockInteractionTarget,
  isInteractionTargetBlocked,
  listInteractionBlocklist
} from '../../../packages/database/src/interaction-blocklist.js';

type Row = {
  id: string;
  organizationId: string;
  platform: string;
  platformUserId: string;
  reason: string | null;
  note: string | null;
  blockedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  metadata: Record<string, unknown> | null;
};

function createFakeDb(seed: Row[] = []) {
  const rows = [...seed];
  let seq = 0;
  return {
    rows,
    interactionBlocklist: {
      findUnique: async ({
        where
      }: {
        where: {
          organizationId_platform_platformUserId?: {
            organizationId: string;
            platform: string;
            platformUserId: string;
          };
          id?: string;
        };
      }) =>
        rows.find(
          (r) =>
            (where.id && r.id === where.id) ||
            (where.organizationId_platform_platformUserId &&
              r.organizationId ===
                where.organizationId_platform_platformUserId.organizationId &&
              r.platform ===
                where.organizationId_platform_platformUserId.platform &&
              r.platformUserId ===
                where.organizationId_platform_platformUserId.platformUserId)
        ) ?? null,
      findFirst: async ({
        where
      }: {
        where: Record<string, unknown>;
      }) =>
        rows.find(
          (r) =>
            (!where.id || r.id === where.id) &&
            (!where.organizationId ||
              r.organizationId === where.organizationId) &&
            (!where.platform || r.platform === where.platform) &&
            (!where.platformUserId ||
              r.platformUserId === where.platformUserId) &&
            (where.deletedAt === null ? r.deletedAt === null : true)
        ) ?? null,
      findMany: async ({
        where,
        orderBy,
        skip,
        take
      }: {
        where: Record<string, unknown>;
        orderBy?: Record<string, string>;
        skip?: number;
        take?: number;
      }) => {
        let list = rows.filter(
          (r) =>
            r.deletedAt === null &&
            (!where.organizationId ||
              r.organizationId === where.organizationId) &&
            (!where.platform || r.platform === where.platform) &&
            (!where.platformUserId ||
              r.platformUserId === where.platformUserId)
        );
        if (orderBy?.createdAt === 'desc') {
          list = [...list].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
          );
        }
        return list.slice(skip ?? 0, take ? (skip ?? 0) + take : undefined);
      },
      count: async ({
        where
      }: {
        where: Record<string, unknown>;
      }) =>
        rows.filter(
          (r) =>
            r.deletedAt === null &&
            (!where.organizationId ||
              r.organizationId === where.organizationId)
        ).length,
      create: async ({ data }: { data: Partial<Row> }) => {
        const row: Row = {
          id: `row-${++seq}`,
          organizationId: data.organizationId!,
          platform: data.platform!,
          platformUserId: data.platformUserId!,
          reason: data.reason ?? null,
          note: data.note ?? null,
          blockedById: data.blockedById ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          metadata: (data.metadata as Record<string, unknown>) ?? null
        };
        rows.push(row);
        return row;
      },
      update: async ({
        where,
        data
      }: {
        where: { id: string };
        data: Partial<Row>;
      }) => {
        const row = rows.find((r) => r.id === where.id);
        if (!row) throw new Error('Record not found');
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    }
  };
}

describe('blockInteractionTarget', () => {
  it('新增黑名单条目', async () => {
    const db = createFakeDb();
    const { record, created } = await blockInteractionTarget(db, {
      organizationId: 'org-1',
      platform: 'douyin',
      platformUserId: 'user-1',
      reason: 'manual',
      note: '恶意评论'
    });
    expect(created).toBe(true);
    expect(record.organizationId).toBe('org-1');
    expect(record.platform).toBe('douyin');
    expect(record.platformUserId).toBe('user-1');
    expect(record.reason).toBe('manual');
    expect(record.deletedAt).toBeNull();
  });

  it('重复拉黑同org+platform+user不新建，created=false', async () => {
    const db = createFakeDb();
    await blockInteractionTarget(db, {
      organizationId: 'org-1',
      platform: 'douyin',
      platformUserId: 'user-1'
    });
    const second = await blockInteractionTarget(db, {
      organizationId: 'org-1',
      platform: 'douyin',
      platformUserId: 'user-1'
    });
    expect(second.created).toBe(false);
    expect(db.rows.length).toBe(1);
  });

  it('软删除后重新拉黑复活原行而不是新建', async () => {
    const db = createFakeDb();
    const first = await blockInteractionTarget(db, {
      organizationId: 'org-1',
      platform: 'douyin',
      platformUserId: 'user-1'
    });
    await unblockInteractionTarget(db, 'org-1', first.record.id);
    const again = await blockInteractionTarget(db, {
      organizationId: 'org-1',
      platform: 'douyin',
      platformUserId: 'user-1',
      reason: 'complaint'
    });
    expect(again.created).toBe(true); // 对外表现为新的有效拉黑
    expect(again.record.id).toBe(first.record.id); // 复用同一行，保留历史
    expect(again.record.deletedAt).toBeNull();
    expect(again.record.reason).toBe('complaint');
    expect(db.rows.length).toBe(1);
  });

  it('同 platformUserId 不同组织互不影响', async () => {
    const db = createFakeDb();
    await blockInteractionTarget(db, {
      organizationId: 'org-1',
      platform: 'douyin',
      platformUserId: 'user-1'
    });
    const other = await blockInteractionTarget(db, {
      organizationId: 'org-2',
      platform: 'douyin',
      platformUserId: 'user-1'
    });
    expect(other.created).toBe(true);
    expect(db.rows.length).toBe(2);
  });
});

describe('unblockInteractionTarget / isInteractionTargetBlocked', () => {
  it('解除拉黑（软删除），isBlocked 变 false，且组织隔离', async () => {
    const db = createFakeDb();
    await blockInteractionTarget(db, {
      organizationId: 'org-1',
      platform: 'douyin',
      platformUserId: 'user-1'
    });
    expect(
      await isInteractionTargetBlocked(db, 'org-1', 'douyin', 'user-1')
    ).toBe(true);

    const rows = db.rows;
    const ok = await unblockInteractionTarget(db, 'org-1', rows[0].id);
    expect(ok).toBe(true);
    expect(
      await isInteractionTargetBlocked(db, 'org-1', 'douyin', 'user-1')
    ).toBe(false);
    // 软删除：行还在
    expect(db.rows.length).toBe(1);
    expect(db.rows[0].deletedAt).not.toBeNull();
  });

  it('跨组织解除返回 false', async () => {
    const db = createFakeDb();
    await blockInteractionTarget(db, {
      organizationId: 'org-1',
      platform: 'douyin',
      platformUserId: 'user-1'
    });
    expect(await unblockInteractionTarget(db, 'org-2', db.rows[0].id)).toBe(
      false
    );
  });

  it('isBlocked 只看本组织', async () => {
    const db = createFakeDb();
    await blockInteractionTarget(db, {
      organizationId: 'org-1',
      platform: 'douyin',
      platformUserId: 'user-1'
    });
    expect(
      await isInteractionTargetBlocked(db, 'org-2', 'douyin', 'user-1')
    ).toBe(false);
    expect(
      await isInteractionTargetBlocked(db, 'org-1', 'xhs', 'user-1')
    ).toBe(false);
  });
});

describe('listInteractionBlocklist', () => {
  it('分页且只返回未删除条目', async () => {
    const db = createFakeDb();
    await blockInteractionTarget(db, {
      organizationId: 'org-1',
      platform: 'douyin',
      platformUserId: 'user-1'
    });
    await blockInteractionTarget(db, {
      organizationId: 'org-1',
      platform: 'douyin',
      platformUserId: 'user-2'
    });
    const blocked = await blockInteractionTarget(db, {
      organizationId: 'org-1',
      platform: 'douyin',
      platformUserId: 'user-3'
    });
    await unblockInteractionTarget(db, 'org-1', blocked.record.id);

    const result = await listInteractionBlocklist(db, 'org-1', {
      page: 1,
      pageSize: 10
    });
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items.every((r: Row) => r.deletedAt === null)).toBe(true);
  });
});
