import type { DatabaseClient } from './client.js';
import type { LeadSourceConfig } from '@prisma/client';
import { applyAssignmentRules } from './assignment.js';
import {
  defaultNextActionAt,
  normalizeInquiryChannel,
  normalizePhone
} from '@ai-growth-ops/shared';

export type InquiryIngestInput = {
  name: string;
  channel?: string | null;
  phone?: string | null;
  email?: string | null;
  imAccount?: string | null;
  company?: string | null;
  message?: string | null;
  country?: string | null;
};

function mergeTags(value: unknown, add: string[]): string[] {
  const base = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
  return [...new Set([...base, ...add])];
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return `${email.slice(0, 1)}****`;
  return `${local.slice(0, 1)}****@${domain}`;
}

function maskPhone(phone: string): string {
  if (phone.length <= 7) return `${phone.slice(0, 2)}****`;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function maskImAccount(account: string): string {
  return `${account.slice(0, 2)}****`;
}

function firstContactMask(input: {
  phone: string;
  email: string | null;
  imAccount: string | null;
}): string | null {
  if (input.phone) return maskPhone(input.phone);
  if (input.email) return maskEmail(input.email);
  if (input.imAccount) return maskImAccount(input.imAccount);
  return null;
}

/** 入参校验类错误：路由层应转 400，其余异常转 500。 */
export class InquiryValidationError extends Error {}

/**
 * 把一条外部询盘写入客户体系：按 手机号 → 邮箱 → IM 账号 三级去重，
 * 已存在则合并信息并追加动态，不存在则创建并按渠道路由分配、通知负责人。
 * 去重与写入在 advisory lock 事务内执行，并发重复推送不会建重客户。
 */
export async function ingestInquiry(
  db: DatabaseClient,
  source: LeadSourceConfig,
  input: InquiryIngestInput
): Promise<{ customerId: string; created: boolean }> {
  const name = input.name.trim();
  if (!name) throw new InquiryValidationError('姓名不能为空');

  const phone = input.phone?.trim() ? normalizePhone(input.phone) : '';
  const email = input.email?.trim().toLowerCase() || null;
  const imAccount = input.imAccount?.trim() || null;
  if (!phone && !email && !imAccount) {
    throw new InquiryValidationError(
      'phone / email / imAccount 至少提供一个联系方式'
    );
  }

  const channel = normalizeInquiryChannel(input.channel ?? 'other');
  const message = input.message?.trim() || null;
  const inquiryTag = `询盘-${channel}`;
  const noteSuffix = `${source.name}${message ? ` · ${message.slice(0, 200)}` : ''}`;

  const assignment = await applyAssignmentRules(
    db,
    source.organizationId,
    { channel },
    'customer'
  );

  const result = await db.$transaction(async (tx) => {
    // 与手动建客户同款兜底：同联系方式并发推送串行化，避免竞态建重。
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${`${source.organizationId}:${phone || email || imAccount}`})
      )
    `;
    const existing = await tx.customer.findFirst({
      where: {
        organizationId: source.organizationId,
        deletedAt: null,
        OR: [
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email }] : []),
          ...(imAccount ? [{ imAccount }] : [])
        ]
      },
      select: { id: true, tags: true, sourceNote: true, assignedTo: true, phone: true, email: true, imAccount: true }
    });

    if (existing) {
      const customer = await tx.customer.update({
        where: { id: existing.id },
        data: {
          tags: mergeTags(existing.tags, [inquiryTag]) as never,
          sourceNote: [existing.sourceNote, `询盘：${noteSuffix}`]
            .filter(Boolean)
            .join('\n'),
          ...(existing.phone ? {} : phone ? { phone } : {}),
          ...(existing.email || !email ? {} : { email }),
          ...(existing.imAccount || !imAccount ? {} : { imAccount })
        }
      });
      await tx.customerActivity.create({
        data: {
          customerId: customer.id,
          action: 'inquiry_received',
          note: message || `通过 ${source.name} 再次询盘`,
          operator: 'webhook'
        }
      });
      return { customerId: customer.id, created: false as const };
    }

    const customer = await tx.customer.create({
      data: {
        organizationId: source.organizationId,
        userId: source.userId,
        displayName: name,
        phone,
        email,
        imAccount,
        company: input.company?.trim() || '待补充',
        role: '待补充',
        intent: message || `通过 ${source.name} 询盘接入`,
        channel: channel as never,
        sourceNote: `询盘：${noteSuffix}`,
        tags: [inquiryTag, '待跟进'] as never,
        assignedTo: assignment.assigneeId,
        nextAction: '首次联系',
        nextActionAt:
          defaultNextActionAt(source.defaultLevel || 'B') ?? undefined,
        metadata: input.country?.trim()
          ? ({ country: input.country.trim() } as never)
          : undefined,
        activities: {
          create: {
            action: 'inquiry_received',
            note: message || `通过 ${source.name} 询盘接入`,
            operator: 'webhook'
          }
        }
      }
    });
    return {
      customerId: customer.id,
      created: true as const,
      notifyUserId: customer.assignedTo ?? assignment.assigneeId
    };
  });

  if (result.created && result.notifyUserId) {
    const masked = firstContactMask({ phone, email, imAccount });
    await db.notification.create({
      data: {
        organizationId: source.organizationId,
        userId: result.notifyUserId,
        type: 'lead',
        title: '询盘新客户',
        content: `「${name}」通过 ${source.name}（渠道 ${channel}）提交询盘${masked ? `，联系方式 ${masked}` : ''}`,
        level: 'warning',
        actionUrl: `/customers/${result.customerId}`
      }
    });
  }

  return { customerId: result.customerId, created: result.created };
}

