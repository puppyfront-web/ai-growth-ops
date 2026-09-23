import type { Page } from '@playwright/test';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';

function requireE2eDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('ai_growth_ops_e2e')) {
    throw new Error('Refusing to reset a non-e2e database');
  }
  return url;
}

export async function resetAndSeedDatabase(): Promise<void> {
  requireE2eDatabaseUrl();
  const db = createDatabaseClient();
  try {
    await resetDatabase(db);
    await seedDatabase(db);
  } finally {
    await db.$disconnect();
  }
}

export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('邮箱').fill('admin@ai-growth-ops.local');
  await page.getByLabel('密码').fill('changeme123');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/prospecting', { waitUntil: 'domcontentloaded' });
}

export async function seedProspectingAccount(): Promise<string> {
  requireE2eDatabaseUrl();
  const db = createDatabaseClient();
  try {
    const admin = await db.user.findFirstOrThrow({
      where: { email: 'admin@ai-growth-ops.local' }
    });
    const membership = await db.organizationMember.findFirstOrThrow({
      where: { userId: admin.id, status: 'active' }
    });
    const account = await db.platformAccount.create({
      data: {
        organizationId: membership.organizationId,
        userId: admin.id,
        platform: 'douyin',
        name: 'E2E 获客账号',
        mode: 'browser_assist',
        status: 'active',
        cookieRef: 'e2e-cookie-reference'
      }
    });
    return account.id;
  } finally {
    await db.$disconnect();
  }
}

export async function seedProspectingPlan(platformAccountId?: string) {
  requireE2eDatabaseUrl();
  const db = createDatabaseClient();
  try {
    const admin = await db.user.findFirstOrThrow({
      where: { email: 'admin@ai-growth-ops.local' }
    });
    const membership = await db.organizationMember.findFirstOrThrow({
      where: { userId: admin.id, status: 'active' }
    });
    const requirement =
      '寻找正在采购企业获客工具的中小企业负责人，排除同行服务商和求职者';
    const plan = {
      version: 1,
      requirement,
      intent: {
        version: 1,
        summary: '寻找有企业获客工具采购意向的中小企业负责人',
        offering: '企业获客工具',
        targetAudience: {
          roles: ['负责人'],
          industries: [],
          organizationTypes: ['中小企业'],
          regions: []
        },
        painPoints: ['获客效率低'],
        useCases: ['企业获客'],
        buyingSignals: ['采购', '选型'],
        exclusions: ['同行服务商', '求职者'],
        ambiguities: []
      },
      strategies: [
        {
          id: 'pain',
          type: 'pain_help',
          title: '痛点求助',
          rationale: '发现主动求助者',
          enabled: true,
          priority: 1,
          queries: ['企业获客困难'],
          negativeSignals: ['同行推广'],
          budget: { maxQueries: 1, maxVideos: 2 }
        },
        {
          id: 'purchase',
          type: 'purchase_evaluation',
          title: '采购选型',
          rationale: '发现正在选型的客户',
          enabled: true,
          priority: 1,
          queries: ['获客工具怎么选'],
          negativeSignals: [],
          budget: { maxQueries: 1, maxVideos: 2 }
        }
      ],
      limits: {
        maxTotalQueries: 8,
        maxTotalVideos: 4,
        maxCommentsPerVideo: 30
      }
    } as const;
    const draft = await db.prospectingPlanDraft.create({
      data: {
        organizationId: membership.organizationId,
        userId: admin.id,
        platform: 'douyin',
        platformAccountId,
        requirement,
        intent: plan.intent,
        strategyPlan: plan,
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    return { planId: draft.id, plan };
  } finally {
    await db.$disconnect();
  }
}

export async function seedConversationFixture(): Promise<{
  conversationId: string;
  interactionId: string;
  customerName: string;
}> {
  requireE2eDatabaseUrl();
  const db = createDatabaseClient();
  const customerName = 'E2E 会话客户';
  try {
    const admin = await db.user.findFirstOrThrow({
      where: { email: 'admin@ai-growth-ops.local' }
    });
    const membership = await db.organizationMember.findFirstOrThrow({
      where: { userId: admin.id, status: 'active' }
    });
    const account = await db.platformAccount.create({
      data: {
        organizationId: membership.organizationId,
        userId: admin.id,
        platform: 'douyin',
        name: 'E2E 获客账号',
        mode: 'manual_confirm',
        status: 'active'
      }
    });
    const conversation = await db.conversation.create({
      data: {
        organizationId: membership.organizationId,
        userId: admin.id,
        platform: 'douyin',
        platformAccountId: account.id,
        externalUserId: 'e2e_sec_uid',
        externalUserName: customerName,
        status: 'CLASSIFIED',
        lastMessageAt: new Date()
      }
    });
    const interaction = await db.interaction.create({
      data: {
        organizationId: membership.organizationId,
        userId: admin.id,
        platform: 'douyin',
        platformAccountId: account.id,
        conversationId: conversation.id,
        externalInteractionId: `e2e-comment-${Date.now()}`,
        externalUserId: 'e2e_sec_uid',
        externalUserName: customerName,
        type: 'comment',
        content: '想要企业版报价，方便加微信吗',
        status: 'CLASSIFIED',
        classification: {
          create: {
            intent: '询价',
            leadLevel: 'A',
            confidence: 0.9,
            riskLevel: 'low',
            summary: '高意向询价',
            tags: ['e2e']
          }
        }
      }
    });
    return {
      conversationId: conversation.id,
      interactionId: interaction.id,
      customerName
    };
  } finally {
    await db.$disconnect();
  }
}

export async function seedCustomerWithFeishuLink(): Promise<{
  customerId: string;
  displayName: string;
  feishuUrl: string;
}> {
  requireE2eDatabaseUrl();
  const db = createDatabaseClient();
  const displayName = 'E2E 飞书客户';
  const feishuUrl = 'https://feishu.cn/base/e2e?table=tbl&record=rec-e2e';
  try {
    const admin = await db.user.findFirstOrThrow({
      where: { email: 'admin@ai-growth-ops.local' }
    });
    const membership = await db.organizationMember.findFirstOrThrow({
      where: { userId: admin.id, status: 'active' }
    });
    const customer = await db.customer.create({
      data: {
        organizationId: membership.organizationId,
        userId: admin.id,
        displayName,
        phone: '13900139000',
        company: '飞书同步公司',
        role: '采购',
        intent: '需要同步到飞书',
        channel: 'manual',
        metadata: {
          lark: {
            recordId: 'rec-e2e',
            externalUrl: feishuUrl,
            lastSuccess: true,
            syncedAt: new Date().toISOString()
          }
        }
      }
    });
    return { customerId: customer.id, displayName, feishuUrl };
  } finally {
    await db.$disconnect();
  }
}
