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
  /** True when the comment reads like a peer/supplier promoting their own offering — not a potential buyer. */
  sellerSignal?: boolean;
};

export type ProspectScoreSource = 'rules' | 'skill';

export type ProspectUserScoreResult = ProspectScoreResult & {
  scoreSource: ProspectScoreSource;
  audienceFit?: number;
  needStrength?: number;
  buyingIntent?: number;
  evidenceQuality?: number;
  buyingStage?: string;
  confidence?: number;
  riskFlags?: string[];
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
  audienceFit?: unknown;
  needStrength?: unknown;
  buyingIntent?: unknown;
  evidenceQuality?: unknown;
  buyingStage?: unknown;
  confidence?: unknown;
  riskFlags?: unknown;
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

/**
 * Phrases almost exclusively used by peers/suppliers PROMOTING their own
 * offering (招商引流话术), never by someone expressing demand. Matched as
 * plain substrings so judgement stays transparent; question-style buyer
 * asks ("怎么加盟""想代理你们产品") deliberately do NOT appear here.
 */
export const SELLER_SIGNAL_TERMS = [
  '厂家直销',
  '厂家直供',
  '源头厂家',
  '源头货源',
  '一手货源',
  '货源充足',
  '货源稳定',
  '一件代发',
  '支持代发',
  '可代工',
  '代加工',
  '支持贴牌',
  '承接订单',
  '长期接单',
  '诚招',
  '招商',
  '招代理',
  '招加盟',
  '招募合伙人',
  '招募经销商',
  '我们工厂',
  '我们厂家',
  '我们是厂家',
  '我们专业生产',
  '我们供应',
  '可批量供应',
  '长期供货',
  '稳定供货',
  '供货稳定',
  '供货更稳',
  '找我拿货',
  '私信合作',
  '私聊合作',
  '私我合作',
  '评论区拿货',
  // Comment-funnel recruitment: "想体验的朋友欢迎评论区留言" style calls
  // to action — only sellers issue them.
  '欢迎评论区',
  '评论区留言',
  '留言领取',
  '私信领取',
  '主页领取',
  '欢迎私信',
  '欢迎咨询',
  '需要的私我',
  '感兴趣的朋友',
  '想学的朋友',
  '想要的朋友',
  '视频同款',
  '同款教程',
  '完整版在',
  '收徒',
  '接学员',
  // B2B promo slogans (营销软文黑话) — demand-side commenters don't talk
  // like this.
  '赋能',
  // Third-person industry commentary / product-description voice ("Seedance
  // 重新定义赛道，合作客户多为车企") — describes an offering, never asks for
  // one. Phrases buyers also use when evaluating ("落地案例""能批量生成吗")
  // are deliberately excluded to avoid false positives.
  '合作客户',
  '客户多为',
  '广泛应用于',
  '重新定义',
  '技术领先',
  '不再只是',
  // News / commentary voice — reports about an industry, never asks for
  // anything ("马斯克掀起AI价格战""OpenClaw 2.0 深度解读").
  '深度解读',
  '深度观察',
  '的解读',
  '正式发布',
  '重磅发布',
  '官宣'
];

export function scoreProspectCandidate(
  input: ProspectScoreInput
): ProspectScoreResult {
  const text = [input.content, input.profileText ?? '']
    .join('\n')
    .toLowerCase();
  // Keyword hits must come from what the user SAID, not their nickname —
  // bloggers named "XX聊AI转型" used to score as prospects off the handle
  // alone. Role/industry hints from the profile stay allowed below.
  const contentText = input.content.toLowerCase();
  const keywordSet = [...input.keywords, ...(input.icpHighIntentKeywords ?? [])]
    .map(normalizeKeyword)
    .filter(Boolean);

  const matchedKeywords = [
    ...new Set(
      keywordSet.filter(
        (keyword) =>
          contentText.includes(keyword) ||
          keyword.includes(contentText.slice(0, 20))
      )
    )
  ];
  const excludedHits = matchingTerms(text, input.icpExcludedKeywords);
  const roleHits = matchingTerms(text, input.icpTargetRoles);
  const industryHits = matchingTerms(text, input.icpTargetIndustries);
  // Peers promoting their own offering use the same vocabulary as buyers
  // ("采购""供货""合作"), so keyword hits alone cannot separate them — the
  // promotional phrasing can.
  const sellerHits = matchingTerms(text, SELLER_SIGNAL_TERMS);

  let relevanceScore = Math.min(100, matchedKeywords.length * 22);

  if (input.videoTitle) {
    const title = input.videoTitle.toLowerCase();
    const titleHits = input.keywords.filter((k) =>
      title.includes(normalizeKeyword(k))
    );
    if (titleHits.length > 0) {
      // A keyword-matching video title says the COMMENT SECTION is on-topic,
      // not that this particular commenter is — cap the boost so promo/news
      // accounts under industry videos can't ride the title to a pass.
      const capped = Math.min(titleHits.length, 2);
      relevanceScore = Math.min(100, relevanceScore + capped * 6);
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
  if (sellerHits.length > 0) {
    relevanceScore = Math.min(relevanceScore, 25);
  }

  if (
    matchedKeywords.length > 0 &&
    relevanceScore < 35 &&
    excludedHits.length === 0 &&
    sellerHits.length === 0
  ) {
    relevanceScore = 35;
  }

  // Suspected peers are excluded like spam: even a low task threshold must
  // not let promotional supply-side comments back in.
  if (sellerHits.length > 0) {
    return {
      relevanceScore,
      leadLevel: 'D',
      intent: 'peer_promotion',
      summary: `疑似同行/服务商或行业解说（命中：${sellerHits.slice(0, 3).join('、')}）`,
      matchedKeywords,
      sellerSignal: true
    };
  }

  return {
    relevanceScore,
    leadLevel: classification.leadLevel,
    intent: classification.intent,
    summary: classification.summary,
    matchedKeywords
  };
}

const LEVEL_RANK: Record<ProspectLeadLevel, number> = {
  D: 0,
  C: 1,
  B: 2,
  A: 3
};

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

  const matchedKeywords = [
    ...new Set(scores.flatMap((s) => s.matchedKeywords))
  ];
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
  // Seller-signal exclusions are deterministic — the LLM may not resurrect
  // a peer the rules already flagged.
  if (ruleScore.sellerSignal) return ruleScore;

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
    audienceFit: boundedScore(semantic.audienceFit, 30),
    needStrength: boundedScore(semantic.needStrength, 30),
    buyingIntent: boundedScore(semantic.buyingIntent, 30),
    evidenceQuality: boundedScore(semantic.evidenceQuality, 10),
    buyingStage:
      typeof semantic.buyingStage === 'string'
        ? semantic.buyingStage.trim()
        : undefined,
    confidence: boundedScore(semantic.confidence, 100),
    riskFlags: Array.isArray(semantic.riskFlags)
      ? semantic.riskFlags.filter(
          (flag): flag is string => typeof flag === 'string'
        )
      : undefined,
    scoreSource: 'skill'
  };
}

function boundedScore(value: unknown, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(max, Math.round(value)))
    : undefined;
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
  'highIntentKeywords' | 'excludedKeywords'
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
  ],
  // Applied when the organization hasn't configured its own exclusion list —
  // these are supply-side / peer-recruiting phrases that keyword searches
  // surface constantly.
  excludedKeywords: [
    '招商',
    '加盟',
    '招代理',
    '厂家直销',
    '接单',
    '私聊合作',
    '一件代发'
  ]
};
