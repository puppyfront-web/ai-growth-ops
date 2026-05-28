import type { DatabaseClient } from '../../packages/database/src/client';

export async function verifySeedData(db: DatabaseClient): Promise<void> {
  const accounts = await db.platformAccount.count();
  if (accounts !== 6) throw new Error(`Expected 6 platform accounts, got ${accounts}`);

  const content = await db.contentItem.count();
  if (content !== 7) throw new Error(`Expected 7 content items, got ${content}`);

  const variants = await db.contentVariant.count();
  if (variants < 6) throw new Error(`Expected >= 6 content variants, got ${variants}`);

  const jobs = await db.publishJob.count();
  if (jobs !== 4) throw new Error(`Expected 4 publish jobs, got ${jobs}`);

  const interactions = await db.interaction.count();
  if (interactions !== 6) throw new Error(`Expected 6 interactions, got ${interactions}`);

  const leads = await db.lead.count();
  if (leads !== 6) throw new Error(`Expected 6 leads, got ${leads}`);
}

export async function getSeedIds(db: DatabaseClient) {
  const user = await db.user.findFirstOrThrow({ where: { email: 'customer-demo@ai-growth-ops.local' } });
  const accounts = await db.platformAccount.findMany({ where: { userId: user.id } });
  const project = await db.contentProject.findFirstOrThrow({ where: { userId: user.id } });
  const contentItems = await db.contentItem.findMany({ where: { userId: user.id } });
  const variants = await db.contentVariant.findMany({ where: { userId: user.id } });
  const jobs = await db.publishJob.findMany({ where: { userId: user.id } });
  const interactions = await db.interaction.findMany({ where: { userId: user.id } });
  const leads = await db.lead.findMany({ where: { userId: user.id } });

  return { user, accounts, project, contentItems, variants, jobs, interactions, leads };
}
