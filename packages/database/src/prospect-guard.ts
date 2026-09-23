import type { DatabaseClient } from './client.js';
import {
  asProspectEvidenceList,
  emptyProspectGuardState,
  extractProspectVideoId,
  normalizeProspectGuardState,
  PROSPECT_GUARD,
  todayStamp,
  type ProspectGuardState
} from '@ai-growth-ops/shared';

const LEGACY_GUARD_KEY = 'prospecting_guard';

export type ProspectingAccountRef = {
  id: string;
  name: string;
  platform: string;
  cookieRef: string;
};

function ledgerToState(row: {
  date: string;
  videosCrawled: number;
  profilesFetched: number;
  captchaBlockedUntil: Date | null;
  lastVideoAt: Date | null;
  lastProfileAt: Date | null;
  captchaHits: number;
}): ProspectGuardState {
  return normalizeProspectGuardState({
    date: row.date,
    videosCrawled: row.videosCrawled,
    profilesFetched: row.profilesFetched,
    captchaBlockedUntil: row.captchaBlockedUntil?.toISOString() ?? null,
    lastVideoAt: row.lastVideoAt?.toISOString() ?? null,
    lastProfileAt: row.lastProfileAt?.toISOString() ?? null,
    captchaHits: row.captchaHits
  });
}

export async function findProspectingAccount(
  db: DatabaseClient,
  organizationId: string,
  platform: string,
  platformAccountId: string
): Promise<ProspectingAccountRef | null> {
  const account = await db.platformAccount.findFirst({
    where: {
      id: platformAccountId,
      organizationId,
      platform: platform as never,
      mode: 'browser_assist',
      status: 'active',
      deletedAt: null,
      cookieRef: { not: '' }
    },
    select: { id: true, name: true, platform: true, cookieRef: true }
  });
  if (!account?.cookieRef) return null;
  return {
    id: account.id,
    name: account.name,
    platform: account.platform,
    cookieRef: account.cookieRef
  };
}

export async function listProspectingAccounts(
  db: DatabaseClient,
  organizationId: string,
  platform: string
): Promise<ProspectingAccountRef[]> {
  const accounts = await db.platformAccount.findMany({
    where: {
      organizationId,
      platform: platform as never,
      mode: 'browser_assist',
      status: 'active',
      deletedAt: null,
      cookieRef: { not: '' }
    },
    select: { id: true, name: true, platform: true, cookieRef: true },
    orderBy: [{ name: 'asc' }, { createdAt: 'asc' }]
  });
  return accounts.filter(
    (account): account is typeof account & { cookieRef: string } =>
      Boolean(account.cookieRef)
  );
}

async function ensureLedger(
  db: DatabaseClient,
  organizationId: string,
  platformAccountId: string,
  now = new Date()
) {
  const date = todayStamp(now);
  try {
    await db.prospectingGuardLedger.create({
      data: { organizationId, platformAccountId, date }
    });
  } catch {
    /* unique race: another request created today's row */
  }
  return db.prospectingGuardLedger.findUniqueOrThrow({
    where: {
      organizationId_platformAccountId_date: {
        organizationId,
        platformAccountId,
        date
      }
    }
  });
}

async function seedLedgerFromLegacyConfig(
  db: DatabaseClient,
  organizationId: string,
  platformAccountId: string,
  now = new Date()
) {
  const date = todayStamp(now);
  const existing = await db.prospectingGuardLedger.findUnique({
    where: {
      organizationId_platformAccountId_date: {
        organizationId,
        platformAccountId,
        date
      }
    }
  });
  if (existing) return existing;

  const legacy = await db.appConfig.findFirst({
    where: { organizationId, key: LEGACY_GUARD_KEY },
    orderBy: { updatedAt: 'desc' }
  });
  const state = normalizeProspectGuardState(legacy?.value, now);
  try {
    return await db.prospectingGuardLedger.create({
      data: {
        organizationId,
        platformAccountId,
        date: state.date,
        videosCrawled: state.videosCrawled,
        profilesFetched: state.profilesFetched,
        captchaBlockedUntil: state.captchaBlockedUntil
          ? new Date(state.captchaBlockedUntil)
          : null,
        lastVideoAt: state.lastVideoAt ? new Date(state.lastVideoAt) : null,
        lastProfileAt: state.lastProfileAt
          ? new Date(state.lastProfileAt)
          : null,
        captchaHits: state.captchaHits
      }
    });
  } catch {
    return db.prospectingGuardLedger.findUniqueOrThrow({
      where: {
        organizationId_platformAccountId_date: {
          organizationId,
          platformAccountId,
          date
        }
      }
    });
  }
}

export async function loadProspectGuard(
  db: DatabaseClient,
  organizationId: string,
  platformAccountId: string
): Promise<ProspectGuardState> {
  const row = await seedLedgerFromLegacyConfig(
    db,
    organizationId,
    platformAccountId
  );
  return ledgerToState(row);
}

export async function saveProspectGuard(
  db: DatabaseClient,
  organizationId: string,
  platformAccountId: string,
  state: ProspectGuardState
): Promise<ProspectGuardState> {
  const row = await db.prospectingGuardLedger.upsert({
    where: {
      organizationId_platformAccountId_date: {
        organizationId,
        platformAccountId,
        date: state.date
      }
    },
    create: {
      organizationId,
      platformAccountId,
      date: state.date,
      videosCrawled: state.videosCrawled,
      profilesFetched: state.profilesFetched,
      captchaBlockedUntil: state.captchaBlockedUntil
        ? new Date(state.captchaBlockedUntil)
        : null,
      lastVideoAt: state.lastVideoAt ? new Date(state.lastVideoAt) : null,
      lastProfileAt: state.lastProfileAt ? new Date(state.lastProfileAt) : null,
      captchaHits: state.captchaHits
    },
    update: {
      videosCrawled: state.videosCrawled,
      profilesFetched: state.profilesFetched,
      captchaBlockedUntil: state.captchaBlockedUntil
        ? new Date(state.captchaBlockedUntil)
        : null,
      lastVideoAt: state.lastVideoAt ? new Date(state.lastVideoAt) : null,
      lastProfileAt: state.lastProfileAt ? new Date(state.lastProfileAt) : null,
      captchaHits: state.captchaHits
    }
  });
  return ledgerToState(row);
}

export async function claimVideoCrawl(
  db: DatabaseClient,
  organizationId: string,
  platformAccountId: string
): Promise<boolean> {
  const date = todayStamp();
  await ensureLedger(db, organizationId, platformAccountId);
  const claimed = await db.prospectingGuardLedger.updateMany({
    where: {
      organizationId,
      platformAccountId,
      date,
      videosCrawled: { lt: PROSPECT_GUARD.dailyVideoLimit },
      OR: [
        { captchaBlockedUntil: null },
        { captchaBlockedUntil: { lte: new Date() } }
      ]
    },
    data: {
      videosCrawled: { increment: 1 },
      lastVideoAt: new Date()
    }
  });
  return claimed.count === 1;
}

export async function claimProfileFetch(
  db: DatabaseClient,
  organizationId: string,
  platformAccountId: string
): Promise<boolean> {
  const date = todayStamp();
  await ensureLedger(db, organizationId, platformAccountId);
  const claimed = await db.prospectingGuardLedger.updateMany({
    where: {
      organizationId,
      platformAccountId,
      date,
      profilesFetched: { lt: PROSPECT_GUARD.dailyProfileLimit },
      AND: [
        {
          OR: [
            { captchaBlockedUntil: null },
            { captchaBlockedUntil: { lte: new Date() } }
          ]
        },
        {
          OR: [
            { lastProfileAt: null },
            {
              lastProfileAt: {
                lte: new Date(Date.now() - PROSPECT_GUARD.minProfileGapMs)
              }
            }
          ]
        }
      ]
    },
    data: {
      profilesFetched: { increment: 1 },
      lastProfileAt: new Date()
    }
  });
  return claimed.count === 1;
}

export async function markCaptchaBlocked(
  db: DatabaseClient,
  organizationId: string,
  platformAccountId: string
): Promise<ProspectGuardState> {
  const until = new Date(Date.now() + PROSPECT_GUARD.captchaCooldownMs);
  await ensureLedger(db, organizationId, platformAccountId);
  const row = await db.prospectingGuardLedger.update({
    where: {
      organizationId_platformAccountId_date: {
        organizationId,
        platformAccountId,
        date: todayStamp()
      }
    },
    data: {
      captchaBlockedUntil: until,
      captchaHits: { increment: 1 }
    }
  });
  return ledgerToState(row);
}

export async function clearCaptchaBlock(
  db: DatabaseClient,
  organizationId: string,
  platformAccountId: string
): Promise<ProspectGuardState> {
  await ensureLedger(db, organizationId, platformAccountId);
  const row = await db.prospectingGuardLedger.update({
    where: {
      organizationId_platformAccountId_date: {
        organizationId,
        platformAccountId,
        date: todayStamp()
      }
    },
    data: { captchaBlockedUntil: null }
  });
  return ledgerToState(row);
}

export async function loadRecentCrawledVideoIds(
  db: DatabaseClient,
  organizationId: string,
  platform: string,
  now = new Date()
): Promise<Set<string>> {
  const since = new Date(
    now.getTime() - PROSPECT_GUARD.videoSkipTtlDays * 24 * 60 * 60 * 1000
  );
  const [sightings, candidates] = await Promise.all([
    db.prospectingCrawledVideo.findMany({
      where: {
        organizationId,
        platform: platform as never,
        lastCrawledAt: { gte: since }
      },
      select: { videoId: true }
    }),
    db.prospectCandidate.findMany({
      where: {
        organizationId,
        platform: platform as never,
        createdAt: { gte: since }
      },
      select: {
        sourcePostId: true,
        sourceVideoUrl: true,
        evidence: true
      }
    })
  ]);

  const ids = new Set<string>();
  for (const row of sightings) ids.add(row.videoId);
  for (const row of candidates) {
    const fromPost = extractProspectVideoId(row.sourcePostId);
    const fromUrl = extractProspectVideoId(row.sourceVideoUrl);
    if (fromPost) ids.add(fromPost);
    if (fromUrl) ids.add(fromUrl);
    for (const item of asProspectEvidenceList(row.evidence)) {
      const id = extractProspectVideoId(item.sourceVideoUrl);
      if (id) ids.add(id);
    }
  }
  return ids;
}

export async function recordCrawledVideo(
  db: DatabaseClient,
  input: {
    organizationId: string;
    platform: string;
    videoId: string;
    commentCount: number;
    taskId: string;
  }
): Promise<void> {
  const videoId = extractProspectVideoId(input.videoId);
  if (!videoId) return;
  await db.prospectingCrawledVideo.upsert({
    where: {
      organizationId_platform_videoId: {
        organizationId: input.organizationId,
        platform: input.platform as never,
        videoId
      }
    },
    create: {
      organizationId: input.organizationId,
      platform: input.platform as never,
      videoId,
      lastCrawledAt: new Date(),
      commentCount: input.commentCount,
      taskId: input.taskId
    },
    update: {
      lastCrawledAt: new Date(),
      commentCount: input.commentCount,
      taskId: input.taskId
    }
  });
}

export { emptyProspectGuardState };
