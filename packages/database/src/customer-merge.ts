import type { DatabaseClient } from './client.js';

function mergeTags(existing: unknown, extra: unknown): string[] {
  const read = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  return [...new Set([...read(existing), ...read(extra)])];
}

function appendNote(
  existing: string | null | undefined,
  next: string | null | undefined
): string | null {
  const parts = [existing?.trim(), next?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join('\n') : null;
}

export async function findCustomerDuplicateGroups(
  db: DatabaseClient,
  organizationId: string
) {
  const phoneGroups = await db.customer.groupBy({
    by: ['phone'],
    where: {
      organizationId,
      deletedAt: null,
      phone: { not: '' }
    },
    _count: { _all: true },
    having: { phone: { _count: { gt: 1 } } }
  });

  const nameGroups = await db.customer.groupBy({
    by: ['displayName', 'channel'],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
    having: { displayName: { _count: { gt: 1 } } }
  });

  const groups: Array<{
    key: string;
    type: 'phone' | 'name';
    customers: Array<{
      id: string;
      displayName: string;
      phone: string;
      company: string;
      status: string;
      createdAt: Date;
    }>;
  }> = [];

  for (const group of phoneGroups) {
    const customers = await db.customer.findMany({
      where: { organizationId, deletedAt: null, phone: group.phone },
      select: {
        id: true,
        displayName: true,
        phone: true,
        company: true,
        status: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    });
    groups.push({ key: `phone:${group.phone}`, type: 'phone', customers });
  }

  for (const group of nameGroups) {
    const customers = await db.customer.findMany({
      where: {
        organizationId,
        deletedAt: null,
        displayName: group.displayName,
        channel: group.channel
      },
      select: {
        id: true,
        displayName: true,
        phone: true,
        company: true,
        status: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    });
    const overlap = groups.some((existing) =>
      existing.customers.some((customer) =>
        customers.some((item) => item.id === customer.id)
      )
    );
    if (!overlap) {
      groups.push({
        key: `name:${group.displayName}:${group.channel}`,
        type: 'name',
        customers
      });
    }
  }

  return groups;
}

export async function findDuplicateCandidatesForCustomer(
  db: DatabaseClient,
  customerId: string,
  organizationId: string
) {
  const target = await db.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null }
  });
  if (!target) throw new Error('客户不存在');

  const or: Array<Record<string, unknown>> = [];
  if (target.phone.trim()) or.push({ phone: target.phone });
  if (target.displayName.trim()) {
    or.push({ displayName: target.displayName, channel: target.channel });
  }
  if (or.length === 0) return [];

  return db.customer.findMany({
    where: {
      organizationId,
      deletedAt: null,
      id: { not: target.id },
      OR: or as never
    },
    select: {
      id: true,
      displayName: true,
      phone: true,
      company: true,
      status: true,
      createdAt: true
    },
    orderBy: { createdAt: 'asc' }
  });
}

export async function mergeCustomers(
  db: DatabaseClient,
  input: {
    organizationId: string;
    targetCustomerId: string;
    sourceCustomerId: string;
    operator?: string | null;
  }
) {
  if (input.targetCustomerId === input.sourceCustomerId) {
    throw new Error('不能合并到同一个客户');
  }

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${`merge:${input.organizationId}:${input.targetCustomerId}`})
      )
    `;

    const [target, source] = await Promise.all([
      tx.customer.findFirst({
        where: {
          id: input.targetCustomerId,
          organizationId: input.organizationId,
          deletedAt: null
        }
      }),
      tx.customer.findFirst({
        where: {
          id: input.sourceCustomerId,
          organizationId: input.organizationId,
          deletedAt: null
        }
      })
    ]);
    if (!target || !source) throw new Error('客户不存在或已合并');

    await Promise.all([
      tx.lead.updateMany({
        where: { customerId: source.id, organizationId: input.organizationId },
        data: { customerId: target.id }
      }),
      tx.deal.updateMany({
        where: { customerId: source.id, organizationId: input.organizationId },
        data: { customerId: target.id }
      }),
      tx.prospectCandidate.updateMany({
        where: { customerId: source.id, organizationId: input.organizationId },
        data: { customerId: target.id }
      }),
      tx.outreachEnrollment.updateMany({
        where: { customerId: source.id, organizationId: input.organizationId },
        data: { customerId: target.id }
      }),
      tx.leadCaptureSubmission.updateMany({
        where: { customerId: source.id, organizationId: input.organizationId },
        data: { customerId: target.id }
      })
    ]);

    const merged = await tx.customer.update({
      where: { id: target.id },
      data: {
        phone: target.phone || source.phone,
        company:
          target.company && target.company !== '待补充'
            ? target.company
            : source.company,
        role:
          target.role && target.role !== '待补充' ? target.role : source.role,
        intent: target.intent || source.intent,
        tags: mergeTags(target.tags, source.tags) as never,
        sourceNote: appendNote(target.sourceNote, source.sourceNote),
        nextAction: target.nextAction ?? source.nextAction,
        nextActionAt: target.nextActionAt ?? source.nextActionAt,
        assignedTo: target.assignedTo ?? source.assignedTo,
        metadata: {
          ...(target.metadata &&
          typeof target.metadata === 'object' &&
          !Array.isArray(target.metadata)
            ? (target.metadata as Record<string, unknown>)
            : {}),
          mergedCustomerIds: [
            ...new Set([
              ...(((target.metadata as Record<string, unknown> | null)
                ?.mergedCustomerIds as string[] | undefined) ?? []),
              source.id
            ])
          ]
        } as never
      }
    });

    await tx.customer.update({
      where: { id: source.id },
      data: {
        deletedAt: new Date(),
        metadata: {
          ...(source.metadata &&
          typeof source.metadata === 'object' &&
          !Array.isArray(source.metadata)
            ? (source.metadata as Record<string, unknown>)
            : {}),
          mergedIntoCustomerId: target.id,
          mergedAt: new Date().toISOString(),
          mergedBy: input.operator ?? null
        } as never
      }
    });

    await tx.customerActivity.createMany({
      data: [
        {
          customerId: target.id,
          action: 'merged_from_customer',
          note: `合并客户 ${source.displayName}（${source.id}）`,
          operator: input.operator ?? null
        },
        {
          customerId: source.id,
          action: 'merged_into_customer',
          note: `已合并到 ${target.displayName}（${target.id}）`,
          operator: input.operator ?? null
        }
      ]
    });

    return {
      target: merged,
      sourceCustomerId: source.id,
      moved: {
        leads: await tx.lead.count({ where: { customerId: target.id } }),
        deals: await tx.deal.count({ where: { customerId: target.id } })
      }
    };
  });
}
