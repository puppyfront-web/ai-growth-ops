import { Prisma } from '@prisma/client';
import {
  hashBucket,
  pickVariant,
  summarizeExperiment,
  type ExperimentVariant
} from '@ai-growth-ops/shared';
import type { DatabaseClient } from './client.js';

/** Accepts a plain client or a transaction client for best-effort wiring. */
type DbLike = DatabaseClient | Prisma.TransactionClient;

function parseVariants(value: unknown): ExperimentVariant[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is ExperimentVariant =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as ExperimentVariant).key === 'string' &&
        typeof (item as ExperimentVariant).name === 'string' &&
        typeof (item as ExperimentVariant).weight === 'number'
    )
    .map((item) => ({ ...item }));
}

function validateVariants(variants: ExperimentVariant[]) {
  if (variants.length < 2) throw new Error('实验至少需要两个变体');
  const keys = new Set<string>();
  for (const variant of variants) {
    if (!variant.key.trim() || !variant.name.trim()) {
      throw new Error('变体 key 和名称不能为空');
    }
    if (keys.has(variant.key)) throw new Error('变体 key 不能重复');
    if (!Number.isFinite(variant.weight) || variant.weight <= 0) {
      throw new Error('变体权重必须大于 0');
    }
    keys.add(variant.key);
  }
}

export async function createExperiment(
  db: DatabaseClient,
  input: {
    organizationId: string;
    userId: string;
    name: string;
    description?: string | null;
    metric?: string;
    variants: ExperimentVariant[];
  }
) {
  validateVariants(input.variants);
  return db.experiment.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      metric: input.metric?.trim() || 'conversion',
      variants: input.variants as never
    }
  });
}

export async function listExperiments(
  db: DatabaseClient,
  organizationId: string
) {
  return db.experiment.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: 200
  });
}

export async function getExperiment(
  db: DatabaseClient,
  experimentId: string,
  organizationId: string
) {
  const experiment = await db.experiment.findFirst({
    where: { id: experimentId, organizationId }
  });
  if (!experiment) throw new Error('实验不存在');
  return experiment;
}

export async function startExperiment(
  db: DatabaseClient,
  experimentId: string,
  organizationId: string
) {
  const experiment = await getExperiment(db, experimentId, organizationId);
  if (experiment.status !== 'draft') throw new Error('只有草稿实验可以启动');
  return db.experiment.update({
    where: { id: experiment.id },
    data: { status: 'running', startedAt: new Date() }
  });
}

export async function stopExperiment(
  db: DatabaseClient,
  experimentId: string,
  organizationId: string
) {
  const experiment = await getExperiment(db, experimentId, organizationId);
  if (experiment.status !== 'running') throw new Error('只有运行中的实验可以结束');
  return db.experiment.update({
    where: { id: experiment.id },
    data: { status: 'completed', endedAt: new Date() }
  });
}

export async function assignExperimentVariant(
  db: DatabaseClient,
  experimentId: string,
  organizationId: string,
  input: { entityType: string; entityId: string }
) {
  const experiment = await getExperiment(db, experimentId, organizationId);
  if (experiment.status !== 'running') {
    throw new Error('实验未运行，不能分配变体');
  }
  const existing = await db.experimentAssignment.findUnique({
    where: {
      experimentId_entityType_entityId: {
        experimentId: experiment.id,
        entityType: input.entityType,
        entityId: input.entityId
      }
    }
  });
  if (existing) return existing;

  const variants = parseVariants(experiment.variants);
  const variant = pickVariant(
    variants,
    hashBucket(`${experiment.id}:${input.entityType}:${input.entityId}`)
  );
  try {
    return await db.experimentAssignment.create({
      data: {
        experimentId: experiment.id,
        organizationId,
        entityType: input.entityType,
        entityId: input.entityId,
        variantKey: variant.key
      }
    });
  } catch {
    const raced = await db.experimentAssignment.findUnique({
      where: {
        experimentId_entityType_entityId: {
          experimentId: experiment.id,
          entityType: input.entityType,
          entityId: input.entityId
        }
      }
    });
    if (raced) return raced;
    throw new Error('变体分配失败');
  }
}

export async function recordExperimentEvent(
  db: DatabaseClient,
  experimentId: string,
  organizationId: string,
  input: { assignmentId: string; metric: string; value?: number }
) {
  const experiment = await getExperiment(db, experimentId, organizationId);
  const assignment = await db.experimentAssignment.findFirst({
    where: {
      id: input.assignmentId,
      experimentId: experiment.id,
      organizationId
    }
  });
  if (!assignment) throw new Error('实验分配不存在');
  return db.experimentEvent.create({
    data: {
      experimentId: experiment.id,
      assignmentId: assignment.id,
      organizationId,
      metric: input.metric.trim() || experiment.metric,
      value:
        Number.isFinite(input.value) && (input.value as number) > 0
          ? (input.value as number)
          : 1
    }
  });
}

export async function getExperimentResults(
  db: DatabaseClient,
  experimentId: string,
  organizationId: string
) {
  const experiment = await getExperiment(db, experimentId, organizationId);
  const variants = parseVariants(experiment.variants);

  const assignments = await db.experimentAssignment.groupBy({
    by: ['variantKey'],
    where: { experimentId: experiment.id, organizationId },
    _count: { _all: true }
  });
  const events = await db.experimentEvent.findMany({
    where: {
      experimentId: experiment.id,
      organizationId,
      metric: experiment.metric
    },
    select: {
      assignment: { select: { variantKey: true } }
    }
  });

  const assignmentCounts: Record<string, number> = {};
  for (const row of assignments) {
    assignmentCounts[row.variantKey] = row._count._all;
  }
  const conversionCounts: Record<string, number> = {};
  for (const event of events) {
    const key = event.assignment.variantKey;
    conversionCounts[key] = (conversionCounts[key] ?? 0) + 1;
  }

  return {
    experiment,
    variants,
    ...summarizeExperiment(variants, assignmentCounts, conversionCounts)
  };
}

/**
 * Best-effort wiring helper: assigns an entity to a variant of every running
 * experiment in the organization. Never throws — experiment bookkeeping must
 * not break the business action that triggers it.
 *
 * Returns the number of experiments the entity is now assigned to.
 */
export async function assignRunningExperiments(
  db: DbLike,
  organizationId: string,
  input: { entityType: string; entityId: string }
): Promise<number> {
  try {
    const experiments = await db.experiment.findMany({
      where: { organizationId, status: 'running' },
      select: { id: true, variants: true }
    });

    let assigned = 0;
    for (const experiment of experiments) {
      const existing = await db.experimentAssignment.findUnique({
        where: {
          experimentId_entityType_entityId: {
            experimentId: experiment.id,
            entityType: input.entityType,
            entityId: input.entityId
          }
        },
        select: { id: true }
      });
      if (existing) {
        assigned += 1;
        continue;
      }
      const variants = parseVariants(experiment.variants);
      if (variants.length === 0) continue;
      const variant = pickVariant(
        variants,
        hashBucket(
          `${experiment.id}:${input.entityType}:${input.entityId}`
        )
      );
      try {
        await db.experimentAssignment.create({
          data: {
            experimentId: experiment.id,
            organizationId,
            entityType: input.entityType,
            entityId: input.entityId,
            variantKey: variant.key
          }
        });
        assigned += 1;
      } catch {
        // Unique-race (concurrent publish of the same entity) — the
        // competing row already records the assignment.
        assigned += 1;
      }
    }
    return assigned;
  } catch {
    return 0;
  }
}

/**
 * Best-effort wiring helper: records a conversion event for every running
 * experiment whose metric matches. An optional dedupeKey (e.g. `lead:<id>`)
 * prevents retries of the same business action from double counting.
 *
 * Returns the number of events recorded.
 */
export async function recordConversionEvents(
  db: DbLike,
  organizationId: string,
  input: {
    metric: string;
    entityType: string;
    entityId: string;
    dedupeKey?: string;
  }
): Promise<number> {
  try {
    const experiments = await db.experiment.findMany({
      where: { organizationId, status: 'running', metric: input.metric },
      select: { id: true }
    });

    let recorded = 0;
    for (const experiment of experiments) {
      const assignment = await db.experimentAssignment.findUnique({
        where: {
          experimentId_entityType_entityId: {
            experimentId: experiment.id,
            entityType: input.entityType,
            entityId: input.entityId
          }
        },
        select: { id: true }
      });
      if (!assignment) continue;

      if (input.dedupeKey) {
        const duplicate = await db.experimentEvent.findFirst({
          where: {
            experimentId: experiment.id,
            assignmentId: assignment.id,
            metadata: { path: ['dedupeKey'], equals: input.dedupeKey }
          },
          select: { id: true }
        });
        if (duplicate) continue;
      }

      await db.experimentEvent.create({
        data: {
          experimentId: experiment.id,
          assignmentId: assignment.id,
          organizationId,
          metric: input.metric,
          value: 1,
          ...(input.dedupeKey
            ? { metadata: { dedupeKey: input.dedupeKey } as never }
            : {})
        }
      });
      recorded += 1;
    }
    return recorded;
  } catch {
    return 0;
  }
}

/**
 * Records `lead` conversion events for the content item behind a publish job.
 * Called when an interaction on that content converts into a lead; leadId is
 * used as the dedupe key so worker retries do not double count.
 */
export async function recordLeadConversionForPublishJob(
  db: DatabaseClient,
  organizationId: string,
  publishJobId: string,
  leadId?: string
): Promise<number> {
  try {
    const job = await db.publishJob.findFirst({
      where: { id: publishJobId, organizationId },
      select: {
        contentVariant: { select: { contentItemId: true } }
      }
    });
    if (!job) return 0;
    return recordConversionEvents(db, organizationId, {
      metric: 'lead',
      entityType: 'content_item',
      entityId: job.contentVariant.contentItemId,
      dedupeKey: leadId ? `lead:${leadId}` : undefined
    });
  } catch {
    return 0;
  }
}
