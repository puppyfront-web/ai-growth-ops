import type { DatabaseClient } from './client.js';

export type AssignmentRuleConditions = {
  channel?: string;
  level?: string;
  industry?: string;
  region?: string;
};

export type AssignmentSubject = {
  channel?: string | null;
  level?: string | null;
  industry?: string | null;
  region?: string | null;
};

function asConditions(value: unknown): AssignmentRuleConditions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: AssignmentRuleConditions = {};
  for (const key of ['channel', 'level', 'industry', 'region'] as const) {
    const item = source[key];
    if (typeof item === 'string' && item.trim()) {
      result[key] = item.trim().toLowerCase();
    }
  }
  return result;
}

function matches(
  conditions: AssignmentRuleConditions,
  subject: AssignmentSubject
): boolean {
  for (const key of ['channel', 'level', 'industry', 'region'] as const) {
    const expected = conditions[key];
    if (!expected) continue;
    const actual = subject[key]?.trim().toLowerCase();
    if (!actual || actual !== expected) return false;
  }
  return true;
}

async function pickLeastLoadedMember(
  db: DatabaseClient,
  organizationId: string,
  scope: 'lead' | 'customer'
): Promise<string | null> {
  const members = await db.organizationMember.findMany({
    where: {
      organizationId,
      status: 'active',
      role: { in: ['owner', 'admin', 'member'] }
    },
    select: { userId: true, joinedAt: true },
    orderBy: { joinedAt: 'asc' }
  });
  if (members.length === 0) return null;

  let best: { userId: string; load: number; joinedAt: Date } | null = null;
  for (const member of members) {
    const load =
      scope === 'lead'
        ? await db.lead.count({
            where: {
              organizationId,
              assignedTo: member.userId,
              deletedAt: null,
              status: { notIn: ['WON', 'LOST', 'INVALID'] }
            }
          })
        : await db.customer.count({
            where: {
              organizationId,
              assignedTo: member.userId,
              deletedAt: null,
              status: { notIn: ['won', 'lost'] }
            }
          });
    if (
      !best ||
      load < best.load ||
      (load === best.load && member.joinedAt < best.joinedAt)
    ) {
      best = { userId: member.userId, load, joinedAt: member.joinedAt };
    }
  }
  return best?.userId ?? null;
}

export async function listAssignmentRules(
  db: DatabaseClient,
  organizationId: string
) {
  return db.assignmentRule.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }]
  });
}

export async function createAssignmentRule(
  db: DatabaseClient,
  input: {
    organizationId: string;
    name: string;
    priority?: number;
    conditions: AssignmentRuleConditions;
    assigneeId?: string | null;
    strategy?: 'fixed' | 'least_loaded';
    enabled?: boolean;
  }
) {
  return db.assignmentRule.create({
    data: {
      organizationId: input.organizationId,
      name: input.name.trim(),
      priority: input.priority ?? 100,
      conditions: input.conditions as never,
      assigneeId: input.assigneeId?.trim() || null,
      strategy: input.strategy ?? (input.assigneeId ? 'fixed' : 'least_loaded'),
      enabled: input.enabled ?? true
    }
  });
}

export async function updateAssignmentRule(
  db: DatabaseClient,
  ruleId: string,
  organizationId: string,
  input: {
    name?: string;
    priority?: number;
    conditions?: AssignmentRuleConditions;
    assigneeId?: string | null;
    strategy?: 'fixed' | 'least_loaded';
    enabled?: boolean;
  }
) {
  const existing = await db.assignmentRule.findFirst({
    where: { id: ruleId, organizationId, deletedAt: null }
  });
  if (!existing) throw new Error('分配规则不存在');
  return db.assignmentRule.update({
    where: { id: ruleId },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.conditions !== undefined && {
        conditions: input.conditions as never
      }),
      ...(input.assigneeId !== undefined && {
        assigneeId: input.assigneeId?.trim() || null
      }),
      ...(input.strategy !== undefined && { strategy: input.strategy }),
      ...(input.enabled !== undefined && { enabled: input.enabled })
    }
  });
}

export async function deleteAssignmentRule(
  db: DatabaseClient,
  ruleId: string,
  organizationId: string
) {
  const deleted = await db.assignmentRule.updateMany({
    where: { id: ruleId, organizationId, deletedAt: null },
    data: { deletedAt: new Date() }
  });
  if (deleted.count === 0) throw new Error('分配规则不存在');
  return { id: ruleId, deleted: true };
}

export async function applyAssignmentRules(
  db: DatabaseClient,
  organizationId: string,
  subject: AssignmentSubject,
  scope: 'lead' | 'customer' = 'lead'
): Promise<{ assigneeId: string | null; ruleId: string | null }> {
  const rules = await listAssignmentRules(db, organizationId);
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!matches(asConditions(rule.conditions), subject)) continue;

    if (rule.assigneeId) {
      const member = await db.organizationMember.findFirst({
        where: {
          organizationId,
          userId: rule.assigneeId,
          status: 'active'
        },
        select: { userId: true }
      });
      if (member) return { assigneeId: member.userId, ruleId: rule.id };
      continue;
    }

    const assigneeId = await pickLeastLoadedMember(
      db,
      organizationId,
      scope
    );
    if (assigneeId) return { assigneeId, ruleId: rule.id };
  }

  const assigneeId = await pickLeastLoadedMember(db, organizationId, scope);
  return { assigneeId, ruleId: null };
}
