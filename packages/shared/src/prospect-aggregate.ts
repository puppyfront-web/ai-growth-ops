/**
 * Crawlers return one record per comment. The prospecting deliverable is one
 * record per user, so comments are grouped by platform identity before scoring.
 */

const MIN_COMMENT_LENGTH = 3;
const MAX_EVIDENCE_PER_USER = 10;

export type RawProspectComment = {
  externalUserId?: unknown;
  userNickname?: unknown;
  userName?: unknown;
  userHomepage?: unknown;
  avatarUrl?: unknown;
  content?: unknown;
  text?: unknown;
  likeCount?: unknown;
  publishedAt?: unknown;
};

export type RawProspectVideo = {
  contentId?: unknown;
  title?: unknown;
  author?: unknown;
  url?: unknown;
  comments?: RawProspectComment[];
};

export type ProspectEvidence = {
  content: string;
  sourceVideoTitle: string | null;
  sourceVideoUrl: string | null;
  publishedAt: string | null;
  likeCount: number | null;
};

export type AggregatedProspect = {
  userKey: string;
  keyword: string;
  externalUserId: string | null;
  userNickname: string | null;
  userHomepage: string | null;
  avatarUrl: string | null;
  sourceVideoTitle: string | null;
  sourceVideoUrl: string | null;
  sourceVideoAuthor: string | null;
  sourcePostId: string | null;
  evidence: ProspectEvidence[];
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(value: unknown): string | null {
  return text(value) || null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function aggregateProspectComments(
  videos: RawProspectVideo[],
  keyword: string
): AggregatedProspect[] {
  const byUser = new Map<string, AggregatedProspect>();
  const seenEvidence = new Set<string>();

  for (const video of videos) {
    const videoTitle = optionalText(video.title);
    const videoUrl = optionalText(video.url);

    for (const comment of video.comments ?? []) {
      const content = text(comment.content) || text(comment.text);
      if (content.length < MIN_COMMENT_LENGTH) continue;

      const externalUserId = optionalText(comment.externalUserId);
      const userNickname =
        optionalText(comment.userNickname) ?? optionalText(comment.userName);
      const userKey = externalUserId ?? userNickname;
      if (!userKey) continue;

      const evidenceKey = `${userKey}:${content.slice(0, 80)}`;
      if (seenEvidence.has(evidenceKey)) continue;
      seenEvidence.add(evidenceKey);

      let prospect = byUser.get(userKey);
      if (!prospect) {
        prospect = {
          userKey,
          keyword,
          externalUserId,
          userNickname,
          userHomepage: optionalText(comment.userHomepage),
          avatarUrl: optionalText(comment.avatarUrl),
          sourceVideoTitle: videoTitle,
          sourceVideoUrl: videoUrl,
          sourceVideoAuthor: optionalText(video.author),
          sourcePostId: optionalText(video.contentId),
          evidence: []
        };
        byUser.set(userKey, prospect);
      }

      prospect.userNickname ??= userNickname;
      prospect.userHomepage ??= optionalText(comment.userHomepage);
      prospect.avatarUrl ??= optionalText(comment.avatarUrl);

      if (prospect.evidence.length < MAX_EVIDENCE_PER_USER) {
        prospect.evidence.push({
          content,
          sourceVideoTitle: videoTitle,
          sourceVideoUrl: videoUrl,
          publishedAt: optionalText(comment.publishedAt),
          likeCount: count(comment.likeCount)
        });
      }
    }
  }

  return [...byUser.values()];
}

function evidenceKey(item: ProspectEvidence): string {
  return `${item.content.slice(0, 80)}:${item.sourceVideoUrl ?? ''}`;
}

/** Merge newly crawled comments into an existing user record, skipping duplicates. */
export function mergeProspectEvidence(
  existing: ProspectEvidence[],
  incoming: ProspectEvidence[]
): ProspectEvidence[] {
  const seen = new Set<string>();
  const merged: ProspectEvidence[] = [];
  for (const item of [...existing, ...incoming]) {
    const key = evidenceKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= MAX_EVIDENCE_PER_USER) break;
  }
  return merged;
}

/**
 * Keep every comment, but put the strongest follow-up first: the comment used
 * for scoring, then higher like counts.
 */
export function prioritizeProspectEvidence(
  evidence: ProspectEvidence[],
  preferredContent?: string | null
): ProspectEvidence[] {
  return [...evidence].sort((a, b) => {
    if (preferredContent) {
      const aPreferred = a.content === preferredContent;
      const bPreferred = b.content === preferredContent;
      if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
    }
    return (b.likeCount ?? 0) - (a.likeCount ?? 0);
  });
}

export function asProspectEvidenceList(value: unknown): ProspectEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ProspectEvidence => {
    return (
      item != null &&
      typeof item === 'object' &&
      typeof (item as ProspectEvidence).content === 'string'
    );
  });
}
