import { Job } from 'bullmq';
import type { LeadSyncInput } from '../job-types.js';
import { createDatabaseClient } from '@ai-growth-ops/database';
import type { DatabaseClient } from '@ai-growth-ops/database';
import { syncLeadToSink } from '@ai-growth-ops/lead-sinks';

export async function handleLeadSyncFeishuBitable(
  job: Job<LeadSyncInput>
): Promise<void> {
  const { leadId, sinkConfigId } = job.data;
  const db: DatabaseClient = createDatabaseClient();

  try {
    const lead = await db.lead.findFirst({
      where: { id: leadId, deletedAt: null }
    });
    if (!lead) {
      job.log(`Lead ${leadId} not found, skipping`);
      return;
    }

    // Get sink config (scoped to org to prevent cross-tenant data leakage)
    const sinkConfig = sinkConfigId
      ? await db.leadSinkConfig.findFirst({ where: { id: sinkConfigId } })
      : await db.leadSinkConfig.findFirst({
          where: {
            sinkType: 'lark',
            organizationId: lead.organizationId ?? undefined
          }
        });

    if (!sinkConfig) {
      await db.lead.update({ where: { id: leadId }, data: { status: 'NEW' } });
      throw new Error(
        'No Feishu/Lark sink config found. Please configure the integration first.'
      );
    }

    // Respect the enabled flag — a disabled sink should not silently sync.
    if (sinkConfig.enabled === false) {
      job.log(`Feishu sink config ${sinkConfig.id} is disabled, skipping`);
      return;
    }

    const configObj = sinkConfig.config as Record<string, unknown>;

    // Update lead status to SYNCING
    await db.lead.update({
      where: { id: leadId },
      data: { status: 'SYNCING' }
    });

    // Call Feishu Bitable sink
    const result = await syncLeadToSink(
      {
        id: lead.id,
        sourcePlatform: lead.sourcePlatform,
        externalUserName: lead.externalUserName || undefined,
        level: lead.level,
        intent: lead.intent || undefined,
        summary: lead.summary || undefined,
        confidence: lead.confidence || undefined,
        tags: lead.tags,
        assignedTo: lead.assignedTo || undefined,
        nextAction: lead.nextAction || undefined,
        riskLevel: lead.riskLevel || undefined,
        createdAt: lead.createdAt
      },
      'lark',
      {
        appId: configObj.appId as string,
        appSecret: configObj.appSecret as string,
        appToken: configObj.appToken as string,
        tableId: configObj.tableId as string,
        fieldMapping: configObj.fieldMapping as Record<string, string>
      }
    );

    // Update external mapping
    await db.leadExternalMapping.upsert({
      where: { leadId_sinkType: { leadId, sinkType: 'lark' } },
      create: {
        leadId,
        sinkType: 'lark',
        externalId: result.externalId || `lark-${leadId.slice(0, 8)}`,
        externalUrl: result.externalUrl
      },
      update: {
        syncedAt: new Date(),
        externalId: result.externalId || undefined
      }
    });

    // Log sync result
    await db.leadSinkSyncLog.create({
      data: {
        leadId,
        sinkType: 'lark',
        operation: 'upsert_lead',
        status: result.success ? 'success' : 'failed',
        error: result.errorMessage
      }
    });

    // Update lead status — revert to NEW on failure so it's not stuck in SYNCING
    await db.lead.update({
      where: { id: leadId },
      data: { status: result.success ? 'SYNCED' : 'NEW' }
    });

    job.log(
      `Feishu sync for lead ${leadId}: ${result.success ? 'success' : 'failed'}`
    );
  } catch (error) {
    // Revert status so the lead can be retried
    await db.lead
      .update({ where: { id: leadId }, data: { status: 'NEW' } })
      .catch(() => {});
    throw error;
  } finally {
    await db.$disconnect();
  }
}
