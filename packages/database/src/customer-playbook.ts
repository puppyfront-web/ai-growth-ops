import type { DatabaseClient } from './client.js';
import {
  buildRuleBasedPlaybook,
  canTransitionPlaybookStatus,
  isPlaybookDueOverdue,
  normalizeSkillPlaybookActions,
  type PlaybookAction,
  type PlaybookGenerateInput,
  type SkillPlaybookOutput
} from '@ai-growth-ops/shared';

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function buildGenerateInput(customer: {
  displayName: string;
  company: string;
  role: string;
  intent: string;
  channel: string;
  status: string;
  segment: string | null;
  fitScore: number;
  intentScore: number;
  healthScore: number;
  profile: {
    summary: string | null;
    painPoints: unknown;
    interests: unknown;
  } | null;
  activities: Array<{ action: string; note: string | null }>;
}): PlaybookGenerateInput {
  return {
    displayName: customer.displayName,
    company: customer.company,
    role: customer.role,
    intent: customer.intent,
    channel: customer.channel,
    status: customer.status,
    segment: customer.segment,
    fitScore: customer.fitScore,
    intentScore: customer.intentScore,
    healthScore: customer.healthScore,
    profileSummary: customer.profile?.summary ?? null,
    painPoints: asStringArray(customer.profile?.painPoints),
    interests: asStringArray(customer.profile?.interests),
    recentActivities: customer.activities.map((a) => ({
      action: a.action,
      note: a.note
    }))
  };
}

async function generateWithSkill(input: PlaybookGenerateInput): Promise<{
  summary: string;
  reasoning: string;
  actions: PlaybookAction[];
} | null> {
  try {
    const { getSharedSkillRunner } = await import('@ai-growth-ops/skills');
    const runner = getSharedSkillRunner();
    const result = await runner.run<unknown, SkillPlaybookOutput>({
      skillName: 'customer-playbook-generate',
      input
    });
    if (result.status !== 'success' || !result.output?.actions?.length) {
      return null;
    }
    return {
      summary: result.output.summary,
      reasoning: result.output.reasoning ?? '',
      actions: normalizeSkillPlaybookActions(result.output.actions)
    };
  } catch {
    return null;
  }
}

export type CustomerFollowUpItem = {
  customerId: string;
  displayName: string;
  playbookId: string;
  actionId: string;
  title: string;
  dueAt: string;
  overdue: boolean;
  priority: string;
};

export async function listCustomerFollowUps(
  db: DatabaseClient,
  organizationId: string
): Promise<CustomerFollowUpItem[]> {
  const playbooks = await db.customerPlaybook.findMany({
    where: {
      status: 'active',
      customer: { organizationId, deletedAt: null }
    },
    select: {
      id: true,
      actions: true,
      customer: { select: { id: true, displayName: true } }
    }
  });
  const items: CustomerFollowUpItem[] = [];
  for (const playbook of playbooks) {
    const actions = Array.isArray(playbook.actions)
      ? (playbook.actions as PlaybookAction[])
      : [];
    for (const action of actions) {
      if (action.status !== 'pending' || !action.dueAt) continue;
      items.push({
        customerId: playbook.customer.id,
        displayName: playbook.customer.displayName,
        playbookId: playbook.id,
        actionId: action.id,
        title: action.title,
        dueAt: action.dueAt,
        overdue: isPlaybookDueOverdue(action.dueAt),
        priority: action.priority
      });
    }
  }
  return items.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.dueAt.localeCompare(b.dueAt);
  });
}

export async function generateCustomerPlaybook(
  db: DatabaseClient,
  customerId: string,
  organizationId: string
) {
  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null },
    include: {
      profile: true,
      activities: { orderBy: { createdAt: 'desc' }, take: 10 }
    }
  });

  if (!customer) {
    throw new Error('客户不存在');
  }

  const input = buildGenerateInput(customer);
  const skillResult = await generateWithSkill(input);
  const ruleResult = buildRuleBasedPlaybook(input);
  const generated = skillResult ?? ruleResult;
  const generatedBy = skillResult ? 'skill' : 'rules';

  const playbook = await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`playbook:${customerId}`}))
    `;
    await tx.customerPlaybook.updateMany({
      where: { customerId, status: 'draft' },
      data: { status: 'cancelled' }
    });

    return tx.customerPlaybook.create({
      data: {
        customerId,
        summary: generated.summary,
        reasoning: generated.reasoning,
        actions: generated.actions as never,
        status: 'draft',
        generatedBy
      }
    });
  });

  return { playbook, generatedBy };
}

export async function getLatestCustomerPlaybook(
  db: DatabaseClient,
  customerId: string,
  organizationId: string
) {
  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null },
    select: { id: true }
  });
  if (!customer) {
    throw new Error('客户不存在');
  }

  const draft = await db.customerPlaybook.findFirst({
    where: { customerId, status: 'draft' },
    orderBy: { createdAt: 'desc' }
  });
  if (draft) return draft;

  return db.customerPlaybook.findFirst({
    where: { customerId, status: { in: ['active', 'completed'] } },
    orderBy: { createdAt: 'desc' }
  });
}

export async function approveCustomerPlaybook(
  db: DatabaseClient,
  customerId: string,
  playbookId: string,
  organizationId: string,
  approvedBy: string
) {
  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null }
  });
  if (!customer) throw new Error('客户不存在');

  const playbook = await db.customerPlaybook.findFirst({
    where: { id: playbookId, customerId }
  });
  if (!playbook) throw new Error('方案不存在');
  if (playbook.status !== 'draft') {
    throw new Error('仅草稿方案可审批');
  }

  return db.$transaction(async (tx) => {
    await tx.customerPlaybook.updateMany({
      where: { customerId, status: 'active' },
      data: { status: 'completed' }
    });

    const activated = await tx.customerPlaybook.updateMany({
      where: { id: playbookId, customerId, status: 'draft' },
      data: {
        status: 'active',
        approvedAt: new Date(),
        approvedBy
      }
    });
    if (activated.count !== 1) {
      throw new Error('方案已被其他请求处理');
    }

    return tx.customerPlaybook.findUniqueOrThrow({
      where: { id: playbookId }
    });
  });
}

export async function updateCustomerPlaybook(
  db: DatabaseClient,
  customerId: string,
  playbookId: string,
  organizationId: string,
  updates: {
    actions?: PlaybookAction[];
    status?: 'completed' | 'cancelled';
  },
  operator?: string
) {
  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null }
  });
  if (!customer) throw new Error('客户不存在');

  const playbook = await db.customerPlaybook.findFirst({
    where: { id: playbookId, customerId }
  });
  if (!playbook) throw new Error('方案不存在');
  if (
    updates.status &&
    !canTransitionPlaybookStatus(playbook.status, updates.status)
  ) {
    throw new Error(
      `方案状态不可从 ${playbook.status} 变更为 ${updates.status}`
    );
  }

  const prevActions = (playbook.actions as PlaybookAction[]) ?? [];
  const nextActions = updates.actions ?? prevActions;

  const newlyDone = updates.actions
    ? nextActions.filter((a) => {
        const prev = prevActions.find((p) => p.id === a.id);
        return a.status === 'done' && prev?.status !== 'done';
      })
    : [];

  if (newlyDone.length > 0 && playbook.status !== 'active') {
    throw new Error('方案审批后才能执行跟进动作');
  }

  return db.$transaction(async (tx) => {
    const changed = await tx.customerPlaybook.updateMany({
      where: {
        id: playbookId,
        customerId,
        status: playbook.status,
        updatedAt: playbook.updatedAt
      },
      data: {
        ...(updates.actions ? { actions: updates.actions as never } : {}),
        ...(updates.status ? { status: updates.status } : {})
      }
    });
    if (changed.count !== 1) {
      throw new Error('方案已被其他请求更新，请刷新后重试');
    }

    for (const action of newlyDone) {
      await tx.customerActivity.create({
        data: {
          customerId,
          action: `playbook_${action.type}`,
          note: `[${action.title}] ${action.content}`,
          operator
        }
      });
    }

    return tx.customerPlaybook.findUniqueOrThrow({
      where: { id: playbookId }
    });
  });
}
