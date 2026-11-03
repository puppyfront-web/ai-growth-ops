/**
 * 评论/私信用户级黑名单领域服务（spec/47 G1）。
 *
 * 全部操作带 organizationId 过滤；解除拉黑为软删除（deletedAt），
 * 重新拉黑时复活原行（保留历史，不物理删除）。
 */
import type { DatabaseClient } from './client.js';
import type { InteractionBlocklist } from '@prisma/client';

export interface BlockInteractionTargetInput {
  organizationId: string;
  platform: string;
  platformUserId: string;
  /** manual / unsubscribe / complaint */
  reason?: string | null;
  note?: string | null;
  /** 操作人用户 id（手动拉黑时填写） */
  blockedById?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface BlockInteractionTargetResult {
  record: InteractionBlocklist;
  /** true = 新建或复活了有效拉黑；false = 已存在有效拉黑（幂等冲突，API 层应返回 409） */
  created: boolean;
}

/**
 * 拉黑一个平台用户（org + platform + platformUserId 联合唯一）。
 *
 * - 无记录 → 新建
 * - 软删除记录 → 复活并更新原因/备注
 * - 有效记录 → 不改动，created=false（调用方据此返回 409）
 */
export async function blockInteractionTarget(
  db: DatabaseClient,
  input: BlockInteractionTargetInput
): Promise<BlockInteractionTargetResult> {
  const existing = await db.interactionBlocklist.findUnique({
    where: {
      organizationId_platform_platformUserId: {
        organizationId: input.organizationId,
        platform: input.platform,
        platformUserId: input.platformUserId
      }
    }
  });

  if (!existing) {
    const record = await db.interactionBlocklist.create({
      data: {
        organizationId: input.organizationId,
        platform: input.platform,
        platformUserId: input.platformUserId,
        reason: input.reason ?? 'manual',
        note: input.note ?? null,
        blockedById: input.blockedById ?? null,
        metadata: (input.metadata ?? undefined) as never
      }
    });
    return { record, created: true };
  }

  if (existing.deletedAt) {
    // 复活软删除行，保留首次拉黑历史在 metadata
    const record = await db.interactionBlocklist.update({
      where: { id: existing.id },
      data: {
        deletedAt: null,
        reason: input.reason ?? existing.reason ?? 'manual',
        note: input.note ?? null,
        blockedById: input.blockedById ?? existing.blockedById,
        metadata: {
          ...(Array.isArray(existing.metadata)
            ? {}
            : ((existing.metadata as Record<string, unknown>) ?? {})),
          reblockedFrom: existing.id
        } as never
      }
    });
    return { record, created: true };
  }

  return { record: existing, created: false };
}

/**
 * 解除拉黑（软删除）。组织隔离；未找到或跨组织返回 false。
 */
export async function unblockInteractionTarget(
  db: DatabaseClient,
  organizationId: string,
  id: string
): Promise<boolean> {
  const existing = await db.interactionBlocklist.findFirst({
    where: { id, organizationId, deletedAt: null }
  });
  if (!existing) return false;
  await db.interactionBlocklist.update({
    where: { id: existing.id },
    data: { deletedAt: new Date() }
  });
  return true;
}

/**
 * 判断某平台用户当前是否被本组织拉黑（只看未删除条目）。
 */
export async function isInteractionTargetBlocked(
  db: DatabaseClient,
  organizationId: string,
  platform: string,
  platformUserId: string
): Promise<boolean> {
  const row = await db.interactionBlocklist.findFirst({
    where: { organizationId, platform, platformUserId, deletedAt: null },
    select: { id: true }
  });
  return row !== null;
}

/**
 * 查询当前有效的拉黑条目（供发送前检查显示原因）。
 */
export async function findActiveInteractionBlocklist(
  db: DatabaseClient,
  organizationId: string,
  platform: string,
  platformUserId: string
): Promise<InteractionBlocklist | null> {
  return db.interactionBlocklist.findFirst({
    where: { organizationId, platform, platformUserId, deletedAt: null }
  });
}

export interface ListInteractionBlocklistOptions {
  page: number;
  pageSize: number;
  platform?: string;
  platformUserId?: string;
}

/**
 * 分页列出本组织当前有效的黑名单条目（最新在前）。
 */
export async function listInteractionBlocklist(
  db: DatabaseClient,
  organizationId: string,
  options: ListInteractionBlocklistOptions
): Promise<{
  items: InteractionBlocklist[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const where = {
    organizationId,
    deletedAt: null,
    ...(options.platform ? { platform: options.platform } : {}),
    ...(options.platformUserId
      ? { platformUserId: options.platformUserId }
      : {})
  };
  const [items, total] = await Promise.all([
    db.interactionBlocklist.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize
    }),
    db.interactionBlocklist.count({ where })
  ]);
  return { items, total, page: options.page, pageSize: options.pageSize };
}
