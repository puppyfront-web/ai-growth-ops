import { PrismaClient } from '@prisma/client';

export type DatabaseClient = PrismaClient;

export function createDatabaseClient(): DatabaseClient {
  return new PrismaClient();
}

export async function resetDatabase(
  db: DatabaseClient = createDatabaseClient()
): Promise<void> {
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
