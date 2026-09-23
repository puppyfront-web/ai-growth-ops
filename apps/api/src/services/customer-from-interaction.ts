import {
  ensureCustomerFromInteraction,
  trySyncCustomerToFeishu,
  type DatabaseClient
} from '@ai-growth-ops/database';
import { enqueueCustomerProfileRefresh } from './customer-profile.js';

const LEVEL_RANK: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

export async function convertInteractionToCustomerRecord(
  db: DatabaseClient,
  interactionId: string,
  organizationId: string,
  actingUserId: string,
  options?: { minLevel?: 'A' | 'B' | 'C' }
) {
  const interaction = await db.interaction.findFirst({
    where: { id: interactionId, organizationId, deletedAt: null },
    include: { classification: true }
  });
  if (!interaction) throw new Error('互动不存在');
  if (!interaction.platformAccountId || !interaction.externalUserId) {
    throw new Error('互动缺少平台用户标识，无法转入客户库');
  }

  const level = (interaction.classification?.leadLevel ?? 'C') as
    | 'A'
    | 'B'
    | 'C'
    | 'D';
  const minLevel = options?.minLevel ?? 'C';
  if ((LEVEL_RANK[level] ?? 99) > (LEVEL_RANK[minLevel] ?? 99)) {
    throw new Error(`${level} 级互动暂不建议转入客户库`);
  }

  let lead = await db.lead.findUnique({
    where: {
      sourcePlatform_sourceAccountId_externalUserId: {
        sourcePlatform: interaction.platform,
        sourceAccountId: interaction.platformAccountId,
        externalUserId: interaction.externalUserId
      }
    }
  });

  if (!lead) {
    lead = await db.lead.create({
      data: {
        organizationId,
        userId: interaction.userId,
        sourcePlatform: interaction.platform,
        sourceAccountId: interaction.platformAccountId,
        sourceInteractionId: interaction.id,
        sourcePublishJobId: interaction.publishJobId,
        externalUserId: interaction.externalUserId,
        externalUserName: interaction.externalUserName,
        level: level === 'D' ? 'C' : level,
        status: 'NEW',
        intent: interaction.classification?.intent ?? null,
        confidence: interaction.classification?.confidence ?? null,
        summary:
          interaction.classification?.summary ??
          interaction.content.slice(0, 200)
      }
    });
  }

  const result = await ensureCustomerFromInteraction(db, {
    organizationId,
    userId: interaction.userId,
    interactionId: interaction.id,
    leadId: lead.id,
    platform: interaction.platform,
    platformAccountId: interaction.platformAccountId,
    externalUserId: interaction.externalUserId,
    externalUserName: interaction.externalUserName,
    conversationId: interaction.conversationId,
    content: interaction.content,
    intent: interaction.classification?.intent,
    summary: interaction.classification?.summary,
    leadLevel: level,
    source: 'manual_convert'
  });

  await db.interaction.update({
    where: { id: interaction.id },
    data: { status: 'CONVERTED_TO_LEAD' }
  });

  if (result.created) {
    enqueueCustomerProfileRefresh(
      result.customer.id,
      organizationId,
      actingUserId
    ).catch(() => undefined);
  }
  trySyncCustomerToFeishu(
    db,
    result.customer.id,
    organizationId,
    'system'
  ).catch(() => undefined);

  const customer = await db.customer.findFirstOrThrow({
    where: { id: result.customer.id, organizationId, deletedAt: null },
    include: {
      activities: { orderBy: { createdAt: 'desc' }, take: 5 }
    }
  });

  return { customer, lead, created: result.created };
}
