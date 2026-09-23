import { syncLeadToSink, type LeadData } from '@ai-growth-ops/lead-sinks';
import type { Customer } from '@prisma/client';
import type { DatabaseClient } from './client.js';

const CHANNEL_LABELS: Record<string, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat_official: '微信公众号',
  wechat_channels: '视频号',
  baijiahao: '百家号',
  zhihu: '知乎',
  manual: '手动录入',
  import: '批量导入',
  referral: '转介绍',
  exhibition: '展会',
  phone: '电话',
  website: '官网',
  partner: '合作伙伴',
  other: '其他'
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function extractPlaybookNextAction(actions: unknown): string | undefined {
  if (!Array.isArray(actions)) return undefined;
  const pending = actions.find((item) => {
    const row = asRecord(item);
    return row.status === 'pending' && typeof row.title === 'string' && row.title;
  });
  if (!pending) return undefined;
  return String(asRecord(pending).title);
}

export function customerToFeishuLeadData(
  customer: Customer,
  extras?: { nextAction?: string }
): LeadData {
  const meta = asRecord(customer.metadata);
  const level =
    typeof meta.leadLevel === 'string' && meta.leadLevel
      ? meta.leadLevel
      : 'B';
  const channelLabel =
    CHANNEL_LABELS[customer.channel] ?? String(customer.channel);

  return {
    id: customer.id,
    sourcePlatform: channelLabel,
    externalUserName: customer.displayName,
    level,
    intent: customer.intent,
    summary:
      customer.sourceNote?.slice(0, 500) ||
      `${customer.company} · ${customer.role}`,
    tags: customer.tags,
    assignedTo: customer.assignedTo ?? undefined,
    nextAction: customer.segment ?? undefined,
    playbookNextAction: extras?.nextAction,
    riskLevel: 'low',
    createdAt: customer.createdAt,
    phone: customer.phone,
    company: customer.company,
    role: customer.role,
    status: customer.status,
    fitScore: customer.fitScore,
    intentScore: customer.intentScore,
    healthScore: customer.healthScore
  };
}

export function defaultCustomerFeishuFieldMapping(): Record<string, string> {
  return {
    id: 'customer_id',
    sourcePlatform: 'channel',
    externalUserName: 'customer_name',
    level: 'lead_level',
    intent: 'intent',
    summary: 'summary',
    phone: 'phone',
    company: 'company',
    role: 'role',
    status: 'status',
    assignedTo: 'assigned_to',
    nextAction: 'segment',
    playbookNextAction: 'next_action',
    fitScore: 'fit_score',
    intentScore: 'intent_score',
    createdAt: 'created_at'
  };
}

export async function syncCustomerToFeishu(
  db: DatabaseClient,
  customerId: string,
  organizationId: string,
  operator = 'system'
): Promise<{
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  errorMessage?: string;
}> {
  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null }
  });
  if (!customer) throw new Error('客户不存在');

  const sinkConfig = await db.leadSinkConfig.findFirst({
    where: { organizationId, sinkType: 'lark', enabled: true }
  });
  if (!sinkConfig) {
    throw new Error('请先在「集成配置 → 飞书」中启用并保存多维表格配置');
  }

  const configObj = asRecord(sinkConfig.config);
  const meta = asRecord(customer.metadata);
  const larkMeta = asRecord(meta.lark);
  const existingRecordId =
    typeof larkMeta.recordId === 'string' ? larkMeta.recordId : undefined;

  const fieldMapping = {
    ...defaultCustomerFeishuFieldMapping(),
    ...(configObj.fieldMapping as Record<string, string> | undefined)
  };

  const playbook = await db.customerPlaybook.findFirst({
    where: {
      customerId: customer.id,
      status: { in: ['draft', 'active'] }
    },
    orderBy: { createdAt: 'desc' }
  });
  const nextAction = extractPlaybookNextAction(playbook?.actions);

  const result = await syncLeadToSink(
    customerToFeishuLeadData(customer, { nextAction }),
    'lark',
    {
      appId: configObj.appId as string,
      appSecret: configObj.appSecret as string,
      appToken: configObj.appToken as string,
      tableId: configObj.tableId as string,
      fieldMapping,
      existingRecordId
    }
  );

  const nextRecordId = result.success
    ? (result.externalId ?? existingRecordId ?? null)
    : (existingRecordId ??
      (typeof larkMeta.recordId === 'string' ? larkMeta.recordId : null));
  const nextExternalUrl = result.success
    ? (result.externalUrl ??
      (typeof larkMeta.externalUrl === 'string' ? larkMeta.externalUrl : null))
    : typeof larkMeta.externalUrl === 'string'
      ? larkMeta.externalUrl
      : null;

  await db.customer.update({
    where: { id: customer.id },
    data: {
      metadata: {
        ...meta,
        lark: {
          recordId: nextRecordId,
          externalUrl: nextExternalUrl,
          syncedAt: new Date().toISOString(),
          lastSuccess: result.success,
          lastError: result.success ? null : result.errorMessage ?? null
        }
      } as never
    }
  });

  await db.customerActivity.create({
    data: {
      customerId: customer.id,
      action: result.success ? 'sync_feishu' : 'sync_feishu_failed',
      note: result.success
        ? '已同步到飞书多维表格'
        : result.errorMessage || '飞书同步失败',
      operator
    }
  });

  const primaryLead = await db.lead.findFirst({
    where: { customerId: customer.id, deletedAt: null },
    orderBy: { createdAt: 'desc' }
  });
  if (primaryLead && result.success) {
    await db.leadExternalMapping.upsert({
      where: {
        leadId_sinkType: { leadId: primaryLead.id, sinkType: 'lark' }
      },
      create: {
        leadId: primaryLead.id,
        sinkType: 'lark',
        externalId: result.externalId || `lark-${customer.id.slice(0, 8)}`,
        externalUrl: result.externalUrl
      },
      update: {
        syncedAt: new Date(),
        externalId: result.externalId || undefined,
        externalUrl: result.externalUrl || undefined
      }
    });
  }

  return {
    success: result.success,
    externalId: result.externalId,
    externalUrl: result.externalUrl,
    errorMessage: result.errorMessage
  };
}

export async function trySyncCustomerToFeishu(
  db: DatabaseClient,
  customerId: string,
  organizationId: string,
  operator = 'system'
): Promise<void> {
  const enabled = await db.leadSinkConfig.findFirst({
    where: { organizationId, sinkType: 'lark', enabled: true },
    select: { id: true }
  });
  if (!enabled) return;
  await syncCustomerToFeishu(db, customerId, organizationId, operator).catch(
    () => undefined
  );
}
