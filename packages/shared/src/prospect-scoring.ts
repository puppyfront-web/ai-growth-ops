import { classifyByRules } from './rule-classifier.js';
import type { IcpConfig } from './customer-scoring.js';

export type ProspectScoreInput = {
  content: string;
  keywords: string[];
  icpHighIntentKeywords?: string[];
  icpTargetRoles?: string[];
  icpTargetIndustries?: string[];
  icpExcludedKeywords?: string[];
  videoTitle?: string;
  profileText?: string;
};

export type ProspectLeadLevel = 'A' | 'B' | 'C' | 'D';

export type ProspectScoreResult = {
  relevanceScore: number;
  leadLevel: ProspectLeadLevel;
  intent: string;
  summary: string;
  matchedKeywords: string[];
};

export type ProspectScoreSource = 'rules' | 'skill';

export type ProspectUserScoreResult = ProspectScoreResult & {
  scoreSource: ProspectScoreSource;
};

export type ProspectUserScoreInput = {
  contents: string[];
  keywords: string[];
  icpHighIntentKeywords?: string[];
  icpTargetRoles?: string[];
  icpTargetIndustries?: string[];
  icpExcludedKeywords?: string[];
  videoTitle?: string;
  profileText?: string;
};

export type SemanticProspectScore = {
  relevanceScore?: unknown;
  leadLevel?: unknown;
  intent?: unknown;
  summary?: unknown;
  matchedKeywords?: unknown;
};

/**
 * Only platforms the browser runner can actually search and read comments from.
 * Widen this list together with the runner extractors, never ahead of them.
 */
export const PROSPECTING_SUPPORTED_PLATFORMS = ['douyin'] as const;

export type ProspectingSupportedPlatform =
  (typeof PROSPECTING_SUPPORTED_PLATFORMS)[number];

export function isProspectingTaskRunnable(status: string): boolean {
  return status === 'draft' || status === 'failed' || status === 'completed';
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().toLowerCase();
}

function matchingTerms(text: string, terms?: string[]): string[] {
  return (terms ?? [])
    .map(normalizeKeyword)
    .filter((term) => term.length > 0 && text.includes(term));
}

export function scoreProspectCandidate(
  input: ProspectScoreInput
): ProspectScoreResult {
  const text = [input.content, input.profileText ?? '']
    .join('\n')
    .toLowerCase();
  const keywordSet = [...input.keywords, ...(input.icpHighIntentKeywords ?? [])]
    .map(normalizeKeyword)
    .filter(Boolean);

  const matchedKeywords = [
    ...new Set(
      keywordSet.filter(
        (keyword) =>
          text.includes(keyword) || keyword.includes(text.slice(0, 20))
      )
    )
  ];
  const excludedHits = matchingTerms(text, input.icpExcludedKeywords);
  const roleHits = matchingTerms(text, input.icpTargetRoles);
  const industryHits = matchingTerms(text, input.icpTargetIndustries);

  let relevanceScore = Math.min(100, matchedKeywords.length * 22);

  if (input.videoTitle) {
    const title = input.videoTitle.toLowerCase();
    const titleHits = input.keywords.filter((k) =>
      title.includes(normalizeKeyword(k))
    );
    if (titleHits.length > 0) {
      relevanceScore = Math.min(100, relevanceScore + titleHits.length * 12);
    }
  }

  const classification = classifyByRules(input.content);

  if (classification.leadLevel === 'A') {
    relevanceScore = Math.min(100, relevanceScore + 28);
  } else if (classification.leadLevel === 'B') {
    relevanceScore = Math.min(100, relevanceScore + 14);
  } else if (classification.leadLevel === 'D') {
    relevanceScore = Math.max(0, relevanceScore - 35);
  }

  if (roleHits.length > 0) {
    relevanceScore = Math.min(100, relevanceScore + 10);
  }
  if (industryHits.length > 0) {
    relevanceScore = Math.min(100, relevanceScore + 8);
  }
  if (excludedHits.length > 0) {
    relevanceScore = Math.min(relevanceScore, 25);
  }

  if (
    matchedKeywords.length > 0 &&
    relevanceScore < 35 &&
    excludedHits.length === 0
  ) {
    relevanceScore = 35;
  }

  return {
    relevanceScore,
    leadLevel: classification.leadLevel,
    intent: classification.intent,
    summary: classification.summary,
    matchedKeywords
  };
}

const LEVEL_RANK: Record<ProspectLeadLevel, number> = { D: 0, C: 1, B: 2, A: 3 };

/**
 * Scores a user from every comment they left: the strongest comment decides the
 * lead level, while repeated on-topic comments add a bounded intensity bonus.
 */
export function scoreProspectUser(
  input: ProspectUserScoreInput
): ProspectUserScoreResult {
  const contents = input.contents.filter((content) => content.trim());
  if (contents.length === 0) {
    return {
      relevanceScore: 0,
      leadLevel: 'D',
      intent: '未知',
      summary: '无有效评论内容',
      matchedKeywords: [],
      scoreSource: 'rules'
    };
  }

  const scores = contents.map((content) =>
    scoreProspectCandidate({
      content,
      keywords: input.keywords,
      icpHighIntentKeywords: input.icpHighIntentKeywords,
      icpTargetRoles: input.icpTargetRoles,
      icpTargetIndustries: input.icpTargetIndustries,
      icpExcludedKeywords: input.icpExcludedKeywords,
      videoTitle: input.videoTitle,
      profileText: input.profileText
    })
  );

  const best = scores.reduce((strongest, current) => {
    const rankDelta =
      LEVEL_RANK[current.leadLevel] - LEVEL_RANK[strongest.leadLevel];
    if (rankDelta > 0) return current;
    if (rankDelta < 0) return strongest;
    return current.relevanceScore > strongest.relevanceScore
      ? current
      : strongest;
  });

  const matchedKeywords = [...new Set(scores.flatMap((s) => s.matchedKeywords))];
  const repeatBonus =
    best.leadLevel === 'D' ? 0 : Math.min(12, (contents.length - 1) * 6);

  return {
    ...best,
    relevanceScore: Math.min(100, best.relevanceScore + repeatBonus),
    matchedKeywords,
    scoreSource: 'rules'
  };
}

function isLeadLevel(value: unknown): value is ProspectLeadLevel {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D';
}

/**
 * Semantic scores come from an LLM skill, so anything out of contract falls
 * back to the deterministic rule score rather than corrupting the result set.
 */
export function mergeSemanticScore(
  ruleScore: ProspectUserScoreResult,
  semantic: SemanticProspectScore | null | undefined
): ProspectUserScoreResult {
  if (!semantic) return ruleScore;

  const { relevanceScore, leadLevel } = semantic;
  if (
    typeof relevanceScore !== 'number' ||
    !Number.isFinite(relevanceScore) ||
    relevanceScore < 0 ||
    relevanceScore > 100 ||
    !isLeadLevel(leadLevel)
  ) {
    return ruleScore;
  }

  const semanticKeywords = Array.isArray(semantic.matchedKeywords)
    ? semantic.matchedKeywords.filter(
        (keyword): keyword is string => typeof keyword === 'string'
      )
    : [];

  return {
    relevanceScore: Math.round(relevanceScore),
    leadLevel,
    intent:
      typeof semantic.intent === 'string' && semantic.intent.trim()
        ? semantic.intent.trim()
        : ruleScore.intent,
    summary:
      typeof semantic.summary === 'string' && semantic.summary.trim()
        ? semantic.summary.trim()
        : ruleScore.summary,
    matchedKeywords: [
      ...new Set([...ruleScore.matchedKeywords, ...semanticKeywords])
    ],
    scoreSource: 'skill'
  };
}

export function passesProspectThreshold(
  score: ProspectScoreResult,
  minRelevanceScore: number
) {
  if (score.leadLevel === 'D') return false;
  return score.relevanceScore >= minRelevanceScore;
}

export const DEFAULT_ICP_FOR_PROSPECTING: Pick<
  IcpConfig,
  'highIntentKeywords'
> = {
  highIntentKeywords: [
    '价格',
    '报价',
    '采购',
    '合作',
    '演示',
    '预约',
    '定制',
    '企业版',
    '批量',
    '试用',
    '方案'
  ]
};
