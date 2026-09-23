import { PrismaClient } from '@prisma/client';

export type DatabaseClient = PrismaClient;

export function createDatabaseClient(): DatabaseClient {
  return new PrismaClient();
}

async function assertDisposableDatabase(db: DatabaseClient): Promise<void> {
  const rows = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  if (rows[0]?.name !== 'ai_growth_ops_e2e') {
    throw new Error('resetDatabase requires the ai_growth_ops_e2e database');
  }
}

export async function resetDatabase(
  db: DatabaseClient = createDatabaseClient()
): Promise<void> {
  await assertDisposableDatabase(db);
  await db.$transaction([
    db.auditLog.deleteMany(),
    db.providerRunLog.deleteMany(),
    db.agentRun.deleteMany(),
    db.skillRun.deleteMany(),
    db.contentOpportunity.deleteMany(),
    db.researchInsight.deleteMany(),
    db.collectedComment.deleteMany(),
    db.collectedPost.deleteMany(),
    db.researchTargetAccount.deleteMany(),
    db.researchKeyword.deleteMany(),
    db.researchTask.deleteMany(),
    db.leadSinkSyncLog.deleteMany(),
    db.leadExternalMapping.deleteMany(),
    db.leadActivity.deleteMany(),
    db.leadSinkConfig.deleteMany(),
    db.lead.deleteMany(),
    db.interaction.deleteMany(),
    db.conversation.deleteMany(),
    db.publishAttempt.deleteMany(),
    db.publishJob.deleteMany(),
    db.mediaAsset.deleteMany(),
    db.contentVariant.deleteMany(),
    db.contentItem.deleteMany(),
    db.contentProject.deleteMany(),
    db.platformCapability.deleteMany(),
    db.chatMessage.deleteMany(),
    db.chatThread.deleteMany(),
    db.notification.deleteMany(),
    db.prospectingCrawledVideo.deleteMany(),
    db.prospectingGuardLedger.deleteMany(),
    db.prospectCandidate.deleteMany(),
    db.prospectingTask.deleteMany(),
    db.customerActivity.deleteMany(),
    db.customerPlaybook.deleteMany(),
    db.customerProfile.deleteMany(),
    db.customer.deleteMany(),
    db.organizationIcpConfig.deleteMany(),
    db.appConfig.deleteMany(),
    db.organizationInvitation.deleteMany(),
    db.organizationMember.deleteMany(),
    db.campaign.deleteMany(),
    db.campaignRun.deleteMany(),
    db.workflow.deleteMany(),
    db.platformAccount.deleteMany(),
    db.user.deleteMany(),
    db.organization.deleteMany()
  ]);
}
