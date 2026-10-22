import { Prisma } from '@prisma/client';
import {
  applyOutreachTemplate,
  checkOutreachGuard,
  nextTouchStatus,
  normalizePhone,
  type OutreachChannel,
  type OutreachChannelCapability,
  type OutreachEnrollmentStatus,
  type OutreachTouchStatus
} from '@ai-growth-ops/shared';
import type { DatabaseClient } from './client.js';
import { assignRunningExperiments } from './experiments.js';

export type OutreachStepInput = {
  order: number;
  delayHours: number;
  template: string;
  requireReview?: boolean;
};

export type CreateOutreachSequenceInput = {
  organizationId: string;
  userId: string;
  name: string;
  description?: string | null;
  channel: OutreachChannel;
  enabled?: boolean;
  steps: OutreachStepInput[];
};

function assertSteps(steps: OutreachStepInput[]) {
  if (steps.length === 0) throw new Error('触达序列至少需要一步');
  const orders = new Set<number>();
  for (const step of steps) {
    if (!Number.isInteger(step.order) || step.order < 1) {
      throw new Error('步骤序号必须是正整数');
    }
    if (orders.has(step.order)) throw new Error('步骤序号不能重复');
    if (!Number.isFinite(step.delayHours) || step.delayHours < 0) {
      throw new Error('步骤间隔必须是非负数');
    }
    if (!step.template.trim()) throw new Error('步骤内容不能为空');
    orders.add(step.order);
  }
}

export async function createOutreachSequence(
  db: DatabaseClient,
  input: CreateOutreachSequenceInput
) {
  assertSteps(input.steps);
  return db.outreachSequence.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      channel: input.channel,
      enabled: input.enabled ?? true,
      steps: {
        create: input.steps
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((step) => ({
            order: step.order,
            delayHours: step.delayHours,
            template: step.template.trim(),
            requireReview: step.requireReview ?? true
          }))
      }
    },
    include: { steps: { orderBy: { order: 'asc' } } }
  });
}

export async function listOutreachSequences(
  db: DatabaseClient,
  organizationId: string
) {
  return db.outreachSequence.findMany({
    where: { organizationId, deletedAt: null },
    include: { steps: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getOutreachSequence(
  db: DatabaseClient,
  sequenceId: string,
  organizationId: string
) {
  const sequence = await db.outreachSequence.findFirst({
    where: { id: sequenceId, organizationId, deletedAt: null },
    include: { steps: { orderBy: { order: 'asc' } } }
  });
  if (!sequence) throw new Error('触达序列不存在');
  return sequence;
}

export async function updateOutreachSequence(
  db: DatabaseClient,
  sequenceId: string,
  organizationId: string,
  input: {
    name?: string;
    description?: string | null;
    channel?: OutreachChannel;
    enabled?: boolean;
    steps?: OutreachStepInput[];
  }
) {
  const existing = await getOutreachSequence(db, sequenceId, organizationId);
  if (input.steps) assertSteps(input.steps);

  return db.$transaction(async (tx) => {
    await tx.outreachSequence.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && {
          description: input.description?.trim() || null
        }),
        ...(input.channel !== undefined && { channel: input.channel }),
        ...(input.enabled !== undefined && { enabled: input.enabled })
      }
    });
    if (input.steps) {
      await tx.outreachStep.deleteMany({ where: { sequenceId: existing.id } });
      await tx.outreachStep.createMany({
        data: input.steps
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((step) => ({
            sequenceId: existing.id,
            order: step.order,
            delayHours: step.delayHours,
            template: step.template.trim(),
            requireReview: step.requireReview ?? true
          }))
      });
    }
    return tx.outreachSequence.findUniqueOrThrow({
      where: { id: existing.id },
      include: { steps: { orderBy: { order: 'asc' } } }
    });
  });
}

export async function softDeleteOutreachSequence(
  db: DatabaseClient,
  sequenceId: string,
  organizationId: string
) {
  await getOutreachSequence(db, sequenceId, organizationId);
  return db.outreachSequence.update({
    where: { id: sequenceId },
    data: { deletedAt: new Date() }
  });
}

function templateVars(customer: {
  displayName: string;
  company: string;
  role: string;
  intent: string;
  phone: string;
}) {
  return {
    name: customer.displayName,
    company: customer.company,
    role: customer.role,
    intent: customer.intent,
    phone: customer.phone
  };
}

async function channelStatuses(
  db: DatabaseClient,
  organizationId: string
): Promise<Record<OutreachChannel, OutreachChannelCapability>> {
  const config = await db.appConfig.findFirst({
    where: { organizationId, key: 'outreach_channel_config' }
  });
  const value =
    config?.value && typeof config.value === 'object' && !Array.isArray(config.value)
      ? (config.value as Record<string, unknown>)
      : {};
  const read = (channel: OutreachChannel): OutreachChannelCapability => {
    const status = value[channel];
    return status === 'verified' ||
      status === 'beta' ||
      status === 'unverified' ||
      status === 'unsupported'
      ? status
      : channel === 'manual' || channel === 'phone_task'
        ? 'verified'
        : 'unverified';
  };
  return {
    manual: read('manual'),
    phone_task: read('phone_task'),
    email: read('email'),
    wecom: read('wecom'),
    official_dm: read('official_dm')
  };
}

export async function isOutreachSuppressed(
  db: DatabaseClient,
  organizationId: string,
  input: {
    customerId?: string | null;
    email?: string | null;
    phone?: string | null;
  }
): Promise<boolean> {
  const or: Prisma.OutreachSuppressionWhereInput[] = [];
  if (input.customerId) {
    or.push({ type: 'customer', value: input.customerId });
  }
  if (input.email?.trim()) {
    or.push({ type: 'email', value: input.email.trim().toLowerCase() });
  }
  if (input.phone?.trim()) {
    or.push({ type: 'phone', value: normalizePhone(input.phone) });
  }
  if (or.length === 0) return false;
  const found = await db.outreachSuppression.findFirst({
    where: { organizationId, OR: or },
    select: { id: true }
  });
  return Boolean(found);
}

export async function enrollCustomerInSequence(
  db: DatabaseClient,
  input: {
    organizationId: string;
    sequenceId: string;
    customerId: string;
    ownerId?: string | null;
    now?: Date;
  }
) {
  const sequence = await db.outreachSequence.findFirst({
    where: {
      id: input.sequenceId,
      organizationId: input.organizationId,
      deletedAt: null,
      enabled: true
    },
    include: { steps: { orderBy: { order: 'asc' } } }
  });
  if (!sequence) throw new Error('触达序列不存在或已停用');
  if (sequence.steps.length === 0) throw new Error('触达序列没有步骤');

  const customer = await db.customer.findFirst({
    where: {
      id: input.customerId,
      organizationId: input.organizationId,
      deletedAt: null
    }
  });
  if (!customer) throw new Error('客户不存在');
  if (customer.status === 'won' || customer.status === 'lost') {
    throw new Error('已成交或已流失的客户不能加入触达序列');
  }
  if (
    await isOutreachSuppressed(db, input.organizationId, {
      customerId: customer.id,
      phone: customer.phone
    })
  ) {
    throw new Error('客户在退订/黑名单中，不能加入触达序列');
  }

  const active = await db.outreachEnrollment.findFirst({
    where: {
      organizationId: input.organizationId,
      sequenceId: sequence.id,
      customerId: customer.id,
      status: 'active'
    },
    include: {
      touches: { orderBy: { scheduledAt: 'asc' }, take: 1 },
      sequence: { include: { steps: { orderBy: { order: 'asc' } } } },
      customer: true
    }
  });
  if (active) {
    return {
      created: false,
      enrollment: active,
      touch: active.touches[0] ?? null
    };
  }

  const now = input.now ?? new Date();
  const firstStep = sequence.steps[0]!;
  const scheduledAt = new Date(
    now.getTime() + firstStep.delayHours * 60 * 60 * 1000
  );
  const content = applyOutreachTemplate(
    firstStep.template,
    templateVars(customer)
  );

  return db.$transaction(async (tx) => {
    const enrollment = await tx.outreachEnrollment.create({
      data: {
        organizationId: input.organizationId,
        sequenceId: sequence.id,
        customerId: customer.id,
        ownerId: input.ownerId?.trim() || customer.assignedTo || null,
        status: 'active',
        startedAt: now
      }
    });
    const touch = await tx.outreachTouch.create({
      data: {
        organizationId: input.organizationId,
        enrollmentId: enrollment.id,
        stepId: firstStep.id,
        channel: sequence.channel,
        scheduledAt,
        status: nextTouchStatus(scheduledAt, now),
        content
      }
    });
    return {
      created: true,
      enrollment: { ...enrollment, customer, sequence },
      touch
    };
  });
}

export async function listOutreachEnrollments(
  db: DatabaseClient,
  organizationId: string,
  filters: { status?: string; customerId?: string; ownerId?: string } = {}
) {
  return db.outreachEnrollment.findMany({
    where: {
      organizationId,
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.ownerId ? { ownerId: filters.ownerId } : {})
    },
    include: {
      customer: {
        select: { id: true, displayName: true, phone: true, status: true }
      },
      sequence: { select: { id: true, name: true, channel: true } },
      touches: { orderBy: { scheduledAt: 'asc' }, take: 3 }
    },
    orderBy: { createdAt: 'desc' },
    take: 200
  });
}

async function loadEnrollment(
  db: DatabaseClient,
  enrollmentId: string,
  organizationId: string
) {
  const enrollment = await db.outreachEnrollment.findFirst({
    where: { id: enrollmentId, organizationId },
    include: { customer: true, sequence: true }
  });
  if (!enrollment) throw new Error('触达报名不存在');
  return enrollment;
}

export async function pauseOutreachEnrollment(
  db: DatabaseClient,
  enrollmentId: string,
  organizationId: string
) {
  const enrollment = await loadEnrollment(db, enrollmentId, organizationId);
  if (enrollment.status !== 'active') throw new Error('只有进行中的触达可以暂停');
  return db.outreachEnrollment.update({
    where: { id: enrollment.id },
    data: { status: 'paused', stopReason: 'paused' }
  });
}

export async function resumeOutreachEnrollment(
  db: DatabaseClient,
  enrollmentId: string,
  organizationId: string
) {
  const enrollment = await loadEnrollment(db, enrollmentId, organizationId);
  if (enrollment.status !== 'paused') throw new Error('只有暂停的触达可以继续');
  return db.outreachEnrollment.update({
    where: { id: enrollment.id },
    data: { status: 'active', stopReason: null }
  });
}

export async function cancelOutreachEnrollment(
  db: DatabaseClient,
  enrollmentId: string,
  organizationId: string,
  reason?: string
) {
  const enrollment = await loadEnrollment(db, enrollmentId, organizationId);
  if (enrollment.status === 'cancelled' || enrollment.status === 'completed') {
    throw new Error('该触达已结束');
  }
  return db.outreachEnrollment.update({
    where: { id: enrollment.id },
    data: {
      status: 'cancelled',
      stoppedAt: new Date(),
      stopReason: reason?.trim() || 'cancelled'
    }
  });
}

export async function listDueOutreachTouches(
  db: DatabaseClient,
  organizationId: string,
  options: { ownerId?: string | null; limit?: number; now?: Date } = {}
) {
  const now = options.now ?? new Date();
  return db.outreachTouch.findMany({
    where: {
      organizationId,
      status: { in: ['planned', 'due'] },
      scheduledAt: { lte: now },
      enrollment: {
        status: 'active',
        ...(options.ownerId ? { ownerId: options.ownerId } : {})
      }
    },
    include: {
      enrollment: {
        include: {
          customer: {
            select: {
              id: true,
              displayName: true,
              phone: true,
              company: true,
              intent: true,
              status: true
            }
          },
          sequence: { select: { id: true, name: true, channel: true } }
        }
      },
      step: { select: { id: true, order: true, delayHours: true } }
    },
    orderBy: { scheduledAt: 'asc' },
    take: options.limit ?? 200
  });
}

function startOfDay(now: Date): Date {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date;
}

function sevenDaysAgo(now: Date): Date {
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

export async function completeOutreachTouch(
  db: DatabaseClient,
  touchId: string,
  organizationId: string,
  input: {
    status: 'sent' | 'skipped' | 'replied';
    note?: string | null;
    externalId?: string | null;
    now?: Date;
  }
) {
  const now = input.now ?? new Date();
  const touch = await db.outreachTouch.findFirst({
    where: { id: touchId, organizationId },
    include: {
      enrollment: {
        include: {
          customer: true,
          sequence: {
            include: { steps: { orderBy: { order: 'asc' } } }
          }
        }
      },
      step: true
    }
  });
  if (!touch) throw new Error('触达记录不存在');
  if (touch.enrollment.status !== 'active') {
    throw new Error('该触达报名已结束');
  }
  if (touch.status !== 'planned' && touch.status !== 'due') {
    throw new Error('该触达已完成');
  }

  if (input.status === 'sent') {
    const statuses = await channelStatuses(db, organizationId);
    const suppressed = await isOutreachSuppressed(db, organizationId, {
      customerId: touch.enrollment.customerId,
      phone: touch.enrollment.customer.phone
    });
    const dailySent = await db.outreachTouch.count({
      where: {
        organizationId,
        status: 'sent',
        sentAt: { gte: startOfDay(now) },
        enrollment: { customerId: touch.enrollment.customerId }
      }
    });
    const weeklySent = await db.outreachTouch.count({
      where: {
        organizationId,
        status: 'sent',
        sentAt: { gte: sevenDaysAgo(now) },
        enrollment: { customerId: touch.enrollment.customerId }
      }
    });
    const guard = checkOutreachGuard({
      channel: touch.channel,
      channelStatus: statuses[touch.channel],
      suppressed,
      dailySent,
      weeklySent,
      now
    });
    if (!guard.allowed) {
      throw new Error(guard.reason || '触达被风控拦截');
    }
  }

  return db.$transaction(async (tx) => {
    // Exposure assignment: a send is the moment the customer enters any
    // running experiment. Best-effort, never blocks the send itself.
    if (input.status === 'sent') {
      await assignRunningExperiments(tx, organizationId, {
        entityType: 'customer',
        entityId: touch.enrollment.customerId
      });
    }

    const updatedTouch =
      input.status === 'replied'
        ? await tx.outreachTouch.update({
            where: { id: touch.id },
            data: {
              status: 'replied',
              repliedAt: now
            }
          })
        : await tx.outreachTouch.update({
            where: { id: touch.id },
            data: {
              status: input.status,
              ...(input.status === 'sent' ? { sentAt: now } : {}),
              ...(input.externalId ? { externalId: input.externalId } : {})
            }
          });

    await tx.customerActivity.create({
      data: {
        customerId: touch.enrollment.customerId,
        action: `outreach_${input.status}`,
        note:
          input.note?.trim() ||
          `${touch.enrollment.sequence.name} · 第 ${touch.step?.order ?? 1} 步`,
        operator: null
      }
    });

    if (input.status === 'replied') {
      const enrollment = await tx.outreachEnrollment.update({
        where: { id: touch.enrollmentId },
        data: { status: 'completed', stoppedAt: now, stopReason: 'replied' }
      });
      return { touch: updatedTouch, nextTouch: null, enrollment };
    }

    const currentOrder = touch.step?.order ?? 0;
    const nextStep = touch.enrollment.sequence.steps.find(
      (step) => step.order > currentOrder
    );
    if (nextStep) {
      const scheduledAt = new Date(
        now.getTime() + nextStep.delayHours * 60 * 60 * 1000
      );
      const nextTouch = await tx.outreachTouch.create({
        data: {
          organizationId,
          enrollmentId: touch.enrollmentId,
          stepId: nextStep.id,
          channel: touch.channel,
          scheduledAt,
          status: nextTouchStatus(scheduledAt, now),
          content: applyOutreachTemplate(
            nextStep.template,
            templateVars(touch.enrollment.customer)
          )
        }
      });
      return {
        touch: updatedTouch,
        nextTouch,
        enrollment: touch.enrollment
      };
    }

    const enrollment = await tx.outreachEnrollment.update({
      where: { id: touch.enrollmentId },
      data: { status: 'completed', stoppedAt: now, stopReason: 'completed' }
    });
    return { touch: updatedTouch, nextTouch: null, enrollment };
  });
}

export async function addOutreachSuppression(
  db: DatabaseClient,
  input: {
    organizationId: string;
    type: 'customer' | 'email' | 'phone';
    value: string;
    reason?: string | null;
    createdBy?: string | null;
  }
) {
  const value =
    input.type === 'email'
      ? input.value.trim().toLowerCase()
      : input.type === 'phone'
        ? normalizePhone(input.value)
        : input.value.trim();
  if (!value) throw new Error('退订对象不能为空');
  return db.outreachSuppression.upsert({
    where: {
      organizationId_type_value: {
        organizationId: input.organizationId,
        type: input.type,
        value
      }
    },
    create: {
      organizationId: input.organizationId,
      type: input.type,
      value,
      reason: input.reason?.trim() || null,
      createdBy: input.createdBy?.trim() || null
    },
    update: {
      reason: input.reason?.trim() || null,
      createdBy: input.createdBy?.trim() || null
    }
  });
}

export async function listOutreachSuppressions(
  db: DatabaseClient,
  organizationId: string
) {
  return db.outreachSuppression.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: 200
  });
}

export async function removeOutreachSuppression(
  db: DatabaseClient,
  suppressionId: string,
  organizationId: string
) {
  const deleted = await db.outreachSuppression.deleteMany({
    where: { id: suppressionId, organizationId }
  });
  if (deleted.count === 0) throw new Error('退订记录不存在');
  return { id: suppressionId, deleted: true };
}

export async function getOutreachWorkbench(
  db: DatabaseClient,
  organizationId: string,
  now = new Date()
) {
  const [due, sentToday, repliedToday, activeEnrollments, suppressions] =
    await Promise.all([
      db.outreachTouch.count({
        where: {
          organizationId,
          status: { in: ['planned', 'due'] },
          scheduledAt: { lte: now },
          enrollment: { status: 'active' }
        }
      }),
      db.outreachTouch.count({
        where: {
          organizationId,
          status: 'sent',
          sentAt: { gte: startOfDay(now) }
        }
      }),
      db.outreachTouch.count({
        where: {
          organizationId,
          status: 'replied',
          repliedAt: { gte: startOfDay(now) }
        }
      }),
      db.outreachEnrollment.count({
        where: { organizationId, status: 'active' }
      }),
      db.outreachSuppression.count({ where: { organizationId } })
    ]);
  return { due, sentToday, repliedToday, activeEnrollments, suppressions };
}

export async function markDueOutreachTouches(
  db: DatabaseClient,
  organizationId?: string,
  now = new Date()
) {
  await db.outreachTouch.updateMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      status: 'planned',
      scheduledAt: { lte: now }
    },
    data: { status: 'due' }
  });
  return db.outreachTouch.count({
    where: {
      ...(organizationId ? { organizationId } : {}),
      status: 'due',
      scheduledAt: { lte: now }
    }
  });
}

export async function escalateOverdueFollowUps(
  db: DatabaseClient,
  organizationId: string,
  now = new Date()
) {
  const admins = await db.organizationMember.findMany({
    where: {
      organizationId,
      status: 'active',
      role: { in: ['owner', 'admin'] }
    },
    select: { userId: true }
  });
  const adminIds = admins.map((admin) => admin.userId);

  const [leads, customers, deals] = await Promise.all([
    db.lead.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { notIn: ['WON', 'LOST', 'INVALID'] },
        nextActionAt: { lt: now },
        slaEscalatedAt: null
      },
      select: {
        id: true,
        externalUserName: true,
        externalUserId: true,
        assignedTo: true,
        nextAction: true,
        nextActionAt: true
      },
      take: 200
    }),
    db.customer.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { notIn: ['won', 'lost'] },
        nextActionAt: { lt: now },
        slaEscalatedAt: null
      },
      select: {
        id: true,
        displayName: true,
        assignedTo: true,
        nextAction: true,
        nextActionAt: true
      },
      take: 200
    }),
    db.deal.findMany({
      where: {
        organizationId,
        deletedAt: null,
        stage: { notIn: ['won', 'lost'] },
        nextActionAt: { lt: now },
        slaEscalatedAt: null
      },
      select: {
        id: true,
        title: true,
        ownerId: true,
        nextAction: true,
        nextActionAt: true
      },
      take: 200
    })
  ]);

  let escalated = 0;

  const notify = async (
    recipientIds: Array<string | null | undefined>,
    title: string,
    actionUrl: string,
    nextAction: string | null
  ) => {
    const recipients = [...new Set(recipientIds.filter(Boolean) as string[])];
    await Promise.all(
      recipients.map((userId) =>
        db.notification.create({
          data: {
            organizationId,
            userId,
            type: 'sla',
            title: '跟进超时',
            content: `「${title}」已超过跟进时间${nextAction ? `：${nextAction}` : ''}`,
            level: 'warning',
            actionUrl
          }
        })
      )
    );
  };

  for (const lead of leads) {
    const updated = await db.lead.updateMany({
      where: { id: lead.id, slaEscalatedAt: null },
      data: { slaEscalatedAt: now }
    });
    if (updated.count === 0) continue;
    escalated += 1;
    await notify(
      [lead.assignedTo, ...adminIds],
      lead.externalUserName || lead.externalUserId,
      `/leads/${lead.id}`,
      lead.nextAction
    );
  }

  for (const customer of customers) {
    const updated = await db.customer.updateMany({
      where: { id: customer.id, slaEscalatedAt: null },
      data: { slaEscalatedAt: now }
    });
    if (updated.count === 0) continue;
    escalated += 1;
    await notify(
      [customer.assignedTo, ...adminIds],
      customer.displayName,
      `/customers/${customer.id}`,
      customer.nextAction
    );
  }

  for (const deal of deals) {
    const updated = await db.deal.updateMany({
      where: { id: deal.id, slaEscalatedAt: null },
      data: { slaEscalatedAt: now }
    });
    if (updated.count === 0) continue;
    escalated += 1;
    await notify(
      [deal.ownerId, ...adminIds],
      deal.title,
      `/customers`,
      deal.nextAction
    );
  }

  return { escalated };
}

export async function scanOutreach(
  db: DatabaseClient,
  organizationId?: string,
  now = new Date()
) {
  const markedDue = await markDueOutreachTouches(db, organizationId, now);
  const orgIds = organizationId
    ? [organizationId]
    : (
        await db.organization.findMany({ select: { id: true } })
      ).map((organization) => organization.id);
  let escalated = 0;
  for (const orgId of orgIds) {
    const result = await escalateOverdueFollowUps(db, orgId, now);
    escalated += result.escalated;
  }
  return { markedDue, escalated };
}

export type OutreachTouchSummary = {
  id: string;
  channel: OutreachChannel;
  status: OutreachTouchStatus;
  scheduledAt: Date;
  content: string | null;
};

export type OutreachEnrollmentSummary = {
  id: string;
  status: OutreachEnrollmentStatus;
};
