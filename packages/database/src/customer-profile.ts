import type { DatabaseClient } from './client.js';
import {
  buildRuleBasedProfile,
  computeCustomerScores,
  DEFAULT_ICP_CONFIG,
  normalizeIcpConfig,
  type IcpConfig,
  type RuleBasedProfile
} from '@ai-growth-ops/shared';

export async function loadIcpConfig(
  db: DatabaseClient,
  organizationId: string
): Promise<IcpConfig> {
  const row = await db.organizationIcpConfig.findUnique({
    where: { organizationId }
  });
  return row ? normalizeIcpConfig(row.value) : { ...DEFAULT_ICP_CONFIG };
}

export async function saveIcpConfig(
  db: DatabaseClient,
  userId: string,
  organizationId: string,
  config: IcpConfig
): Promise<void> {
  const normalized = normalizeIcpConfig(config);
  await db.organizationIcpConfig.upsert({
    where: { organizationId },
    create: {
      organizationId,
      updatedBy: userId,
      value: normalized as never
    },
    update: {
      updatedBy: userId,
      value: normalized as never
    }
  });
}

type ProfileExtractOutput = RuleBasedProfile & {
  industry?: string | null;
  companySize?: string | null;
};

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

const OPERATIONAL_CUSTOMER_TAGS = new Set(['获客转入', '待跟进']);

function mergeOperationalTags(
  existing: unknown,
  profileTags: string[],
  metadata: unknown
): string[] {
  const current = Array.isArray(existing)
    ? existing.filter(
        (tag): tag is string => typeof tag === 'string' && tag.length > 0
      )
    : [];
  const kept = current.filter((tag) => OPERATIONAL_CUSTOMER_TAGS.has(tag));
  const meta =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  if (typeof meta.prospectingTaskId === 'string' && meta.prospectingTaskId) {
    kept.push('获客转入');
  }
  if (meta.pendingContact === true) {
    kept.push('待跟进');
  }
  return [...new Set([...kept, ...profileTags])];
}

async function extractProfileWithSkill(customer: {
  displayName: string;
  company: string;
  role: string;
  intent: string;
  channel: string;
  sourceNote: string | null;
  activities: Array<{ action: string; note: string | null }>;
}): Promise<ProfileExtractOutput | null> {
  try {
    const { getSharedSkillRunner } = await import('@ai-growth-ops/skills');
    const runner = getSharedSkillRunner();
    const result = await runner.run<unknown, ProfileExtractOutput>({
      skillName: 'customer-profile-extract',
      input: {
        displayName: customer.displayName,
        company: customer.company,
        role: customer.role,
        intent: customer.intent,
        channel: customer.channel,
        sourceNote: customer.sourceNote ?? undefined,
        activities: customer.activities.map((a) => ({
          action: a.action,
          note: a.note ?? undefined
        }))
      }
    });
    if (result.status === 'success' && result.output) return result.output;
  } catch {
    return null;
  }
  return null;
}

export async function refreshCustomerProfile(
  db: DatabaseClient,
  customerId: string,
  organizationId: string,
  _userId: string
) {
  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null },
    include: {
      activities: { orderBy: { createdAt: 'desc' }, take: 20 },
      leads: {
        where: { deletedAt: null },
        select: { level: true }
      }
    }
  });

  if (!customer) {
    throw new Error('客户不存在');
  }

  const icp = await loadIcpConfig(db, organizationId);
  const now = new Date();
  const lastActivity = customer.activities[0];
  const daysSinceLastActivity = lastActivity
    ? daysBetween(lastActivity.createdAt, now)
    : null;

  const scoringInput = {
    displayName: customer.displayName,
    company: customer.company,
    role: customer.role,
    intent: customer.intent,
    channel: customer.channel,
    status: customer.status,
    activityCount: customer.activities.length,
    daysSinceLastActivity,
    daysSinceCreated: daysBetween(customer.createdAt, now),
    linkedLeadLevels: customer.leads.map((l) => l.level)
  };

  const scores = computeCustomerScores(scoringInput, icp);
  const skillProfile = await extractProfileWithSkill(customer);
  const ruleProfile = buildRuleBasedProfile(scoringInput);
  const profileData = skillProfile ?? ruleProfile;
  const source = skillProfile ? 'skill' : 'rules';
  const customerTags = mergeOperationalTags(
    customer.tags,
    profileData.tags,
    customer.metadata
  );

  const { profile, updatedCustomer } = await db.$transaction(async (tx) => {
    const changed = await tx.customer.updateMany({
      where: {
        id: customer.id,
        organizationId,
        updatedAt: customer.updatedAt
      },
      data: {
        fitScore: scores.fitScore,
        intentScore: scores.intentScore,
        healthScore: scores.healthScore,
        segment: scores.segment,
        tags: customerTags as never
      }
    });
    if (changed.count !== 1) {
      throw new Error('客户信息已更新，请重新生成画像');
    }

    const profile = await tx.customerProfile.upsert({
      where: { customerId: customer.id },
      create: {
        customerId: customer.id,
        industry: profileData.industry ?? null,
        companySize: profileData.companySize ?? null,
        painPoints: profileData.painPoints,
        interests: profileData.interests,
        budget: profileData.budget ?? null,
        timeline: profileData.timeline ?? null,
        bant: profileData.bant as never,
        summary: profileData.summary,
        tags: profileData.tags,
        source,
        extractedAt: now
      },
      update: {
        industry: profileData.industry ?? null,
        companySize: profileData.companySize ?? null,
        painPoints: profileData.painPoints,
        interests: profileData.interests,
        budget: profileData.budget ?? null,
        timeline: profileData.timeline ?? null,
        bant: profileData.bant as never,
        summary: profileData.summary,
        tags: profileData.tags,
        source,
        version: { increment: 1 },
        extractedAt: now
      }
    });
    const updatedCustomer = await tx.customer.findUniqueOrThrow({
      where: { id: customer.id },
      include: {
        profile: true,
        activities: { orderBy: { createdAt: 'desc' }, take: 10 }
      }
    });
    return { profile, updatedCustomer };
  });

  return { customer: updatedCustomer, profile, scores, source };
}
