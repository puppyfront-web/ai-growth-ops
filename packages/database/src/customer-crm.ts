import type { Platform } from '@prisma/client';
import type { DatabaseClient } from './client.js';

const CHANNEL_BY_PLATFORM: Record<string, string> = {
  douyin: 'douyin',
  xiaohongshu: 'xiaohongshu',
  wechat_official: 'wechat_official',
  wechat_channels: 'wechat_channels',
  baijiahao: 'baijiahao',
  zhihu: 'zhihu'
};

export function buildPlatformUserKey(
  platform: string,
  externalUserId: string
): string {
  return `${platform}:${externalUserId}`;
}

export type AcquisitionIdentity = {
  platform?: string;
  externalUserId?: string | null;
  userKey?: string | null;
};

type CustomerLookupDb = {
  customer: {
    findFirst: DatabaseClient['customer']['findFirst'];
  };
};

function uniqueKeys(
  ...values: Array<string | null | undefined>
): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const key = value?.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
  }
  return [...seen];
}

export async function findCustomerByAcquisitionIdentity(
  db: CustomerLookupDb,
  organizationId: string,
  identity: AcquisitionIdentity
) {
  const platformUserKeys = uniqueKeys(
    identity.platform && identity.externalUserId
      ? buildPlatformUserKey(identity.platform, identity.externalUserId)
      : null,
    identity.platform && identity.userKey
      ? buildPlatformUserKey(identity.platform, identity.userKey)
      : null
  );
  for (const platformUserKey of platformUserKeys) {
    const byKey = await db.customer.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        metadata: { path: ['platformUserKey'], equals: platformUserKey }
      }
    });
    if (byKey) return byKey;
  }

  const prospectKeys = uniqueKeys(identity.userKey, identity.externalUserId);
  for (const prospectUserKey of prospectKeys) {
    const byProspect = await db.customer.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        metadata: { path: ['prospectUserKey'], equals: prospectUserKey }
      }
    });
    if (byProspect) return byProspect;
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mergeTags(existing: unknown, add: string[]): string[] {
  const base = Array.isArray(existing)
    ? existing.filter((t): t is string => typeof t === 'string')
    : [];
  const set = new Set(base);
  for (const tag of add) set.add(tag);
  return [...set];
}

export async function findCustomerByPlatformUser(
  db: CustomerLookupDb,
  organizationId: string,
  platform: string,
  externalUserId: string
) {
  return findCustomerByAcquisitionIdentity(db, organizationId, {
    platform,
    externalUserId,
    userKey: externalUserId
  });
}

export type EnsureCustomerFromInteractionInput = {
  organizationId: string;
  userId: string;
  interactionId: string;
  leadId?: string;
  platform: Platform;
  platformAccountId: string;
  externalUserId: string;
  externalUserName: string | null;
  conversationId: string | null;
  content: string;
  intent?: string | null;
  summary?: string | null;
  leadLevel?: string | null;
  source: 'auto_pipeline' | 'manual_convert';
};

export async function ensureCustomerFromInteraction(
  db: DatabaseClient,
  input: EnsureCustomerFromInteractionInput
): Promise<{ customer: { id: string }; created: boolean }> {
  const platformUserKey = buildPlatformUserKey(
    input.platform,
    input.externalUserId
  );
  const existing = await findCustomerByAcquisitionIdentity(
    db,
    input.organizationId,
    {
      platform: input.platform,
      externalUserId: input.externalUserId,
      userKey: input.externalUserId
    }
  );

  const channel = (CHANNEL_BY_PLATFORM[input.platform] ?? 'other') as never;
  const intentText =
    input.intent?.trim() ||
    input.summary?.trim() ||
    input.content.slice(0, 500) ||
    '来自评论/私信互动';
  const sourceNote = [
    '评论私信转入',
    input.leadLevel ? `${input.leadLevel} 级意向` : null,
    input.summary?.trim() ? `摘要：${input.summary.trim()}` : null,
    `最近互动：${input.content.slice(0, 300)}`
  ]
    .filter(Boolean)
    .join('\n');

  if (existing) {
    const meta = asRecord(existing.metadata);
    const customer = await db.customer.update({
      where: { id: existing.id },
      data: {
        ...(input.externalUserName?.trim() &&
        (existing.displayName === '潜客' ||
          existing.displayName === input.externalUserId)
          ? { displayName: input.externalUserName.trim() }
          : {}),
        metadata: {
          ...meta,
          platformUserKey,
          lastInteractionId: input.interactionId,
          ...(input.conversationId
            ? { conversationId: input.conversationId }
            : {}),
          ...(input.leadLevel ? { leadLevel: input.leadLevel } : {})
        } as never,
        tags: mergeTags(existing.tags, ['评论私信']) as never
      }
    });

    await db.customerActivity.create({
      data: {
        customerId: customer.id,
        action: 'linked_from_interaction',
        note:
          input.source === 'auto_pipeline'
            ? '高意向互动自动关联客户'
            : '手动从评论私信转入客户库',
        operator: input.source === 'auto_pipeline' ? 'system' : null
      }
    });

    if (input.leadId) {
      await db.lead.updateMany({
        where: { id: input.leadId, customerId: null },
        data: { customerId: customer.id }
      });
    }

    return { customer, created: false };
  }

  const customer = await db.customer.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      displayName: input.externalUserName?.trim() || input.externalUserId,
      phone: '',
      company: '待补充',
      role: '待补充',
      intent: intentText,
      channel,
      sourceNote,
      tags: ['评论私信', '待跟进'] as never,
      metadata: {
        platformUserKey,
        sourceInteractionId: input.interactionId,
        conversationId: input.conversationId,
        leadLevel: input.leadLevel ?? null,
        pendingContact: true
      } as never,
      activities: {
        create: {
          action: 'converted_from_interaction',
          note:
            input.source === 'auto_pipeline'
              ? '高意向互动自动创建客户'
              : '从评论私信转入客户库',
          operator: input.source === 'auto_pipeline' ? 'system' : null
        }
      }
    }
  });

  if (input.leadId) {
    await db.lead.update({
      where: { id: input.leadId },
      data: { customerId: customer.id }
    });
  }

  return { customer, created: true };
}

export async function linkLeadToCustomer(
  db: DatabaseClient,
  leadId: string,
  customerId: string
): Promise<void> {
  await db.lead.updateMany({
    where: { id: leadId, customerId: null },
    data: { customerId }
  });
}
