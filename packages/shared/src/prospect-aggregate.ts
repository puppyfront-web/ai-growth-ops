/**
 * Crawlers return one record per comment. The prospecting deliverable is one
 * record per user, so comments are grouped by platform identity before scoring.
 */

const MIN_COMMENT_LENGTH = 3;
const MAX_EVIDENCE_PER_USER = 10;

/**
 * DOM scraping residue that is not a real comment: relative timestamps with
 * an optional location suffix ("5天前·广东", "3小时前") picked up from the
 * comment panel chrome.
 */
const DOM_NOISE_PATTERN = /^\d+\s*(天|小时|分钟|秒)?前(·[\u4e00-\u9fa5]{2,3})?$/;

/**
 * Titles that publish a DEMAND ("求推荐工厂AI改造""这类设备怎么选") rather
 * than promote an offering. Their authors are demand-side users themselves —
 * the hottest leads — so they are aggregated as prospects alongside commenters.
 */
const DEMAND_POST_TITLE_PATTERN =
  /求(?:推荐|介绍|个|教|助)|有没有(?:推荐|做|了解|好)|哪家好?|怎么选|如何选|选哪家|多少钱|报价|靠谱吗|避坑|想上|想引入|想找|咨询一下|急求/;

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

    // Demand-post author: the user who PUBLISHED the ask is a prospect too.
    const author = optionalText(video.author);
    if (author && videoTitle && DEMAND_POST_TITLE_PATTERN.test(videoTitle)) {
      const userKey = `author:${author}`;
      const content = `（需求帖）${videoTitle}`;
      const evidenceKey = `${userKey}:${content.slice(0, 80)}`;
      if (!seenEvidence.has(evidenceKey)) {
        seenEvidence.add(evidenceKey);
        let prospect = byUser.get(userKey);
        if (!prospect) {
          prospect = {
            userKey,
            keyword,
            externalUserId: null,
            userNickname: author,
            userHomepage: null,
            avatarUrl: null,
            sourceVideoTitle: videoTitle,
            sourceVideoUrl: videoUrl,
            sourceVideoAuthor: author,
            sourcePostId: optionalText(video.contentId),
            evidence: []
          };
          byUser.set(userKey, prospect);
        }
        if (prospect.evidence.length < MAX_EVIDENCE_PER_USER) {
          prospect.evidence.push({
            content,
            sourceVideoTitle: videoTitle,
            sourceVideoUrl: videoUrl,
            publishedAt: null,
            likeCount: null
          });
        }
      }
    }

    for (const comment of video.comments ?? []) {
      const content = text(comment.content) || text(comment.text);
      if (content.length < MIN_COMMENT_LENGTH) continue;
      if (DOM_NOISE_PATTERN.test(content)) continue;

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
