export type IcpConfig = {
  targetIndustries: string[];
  targetRoles: string[];
  highIntentKeywords: string[];
  excludedKeywords: string[];
};

export const DEFAULT_ICP_CONFIG: IcpConfig = {
  targetIndustries: [],
  targetRoles: ['经理', '总监', '负责人', '采购', 'ceo', 'cto', 'vp', '主管'],
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
  excludedKeywords: []
};

function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0
  );
}

export function normalizeIcpConfig(value: unknown): IcpConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_ICP_CONFIG };
  }
  const input = value as Record<string, unknown>;
  return {
    targetIndustries: stringArray(
      input.targetIndustries,
      DEFAULT_ICP_CONFIG.targetIndustries
    ),
    targetRoles: stringArray(input.targetRoles, DEFAULT_ICP_CONFIG.targetRoles),
    highIntentKeywords: stringArray(
      input.highIntentKeywords,
      DEFAULT_ICP_CONFIG.highIntentKeywords
    ),
    excludedKeywords: stringArray(
      input.excludedKeywords,
      DEFAULT_ICP_CONFIG.excludedKeywords
    )
  };
}

export type CustomerScoringInput = {
  displayName: string;
  company: string;
  role: string;
  intent: string;
  channel: string;
  status: string;
  activityCount: number;
  daysSinceLastActivity: number | null;
  daysSinceCreated: number;
  linkedLeadLevels: string[];
};

export type CustomerScores = {
  fitScore: number;
  intentScore: number;
  healthScore: number;
  segment: 'hot' | 'warm' | 'cold' | 'at_risk';
};

export type RuleBasedProfile = {
  industry: string | null;
  companySize?: string | null;
  painPoints: string[];
  interests: string[];
  budget: string | null;
  timeline: string | null;
  bant: {
    budget: string | null;
    authority: string | null;
    need: string | null;
    timeline: string | null;
  };
  summary: string;
  tags: string[];
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function containsAny(text: string, keywords: string[]) {
  const lower = text.toLowerCase();
  return keywords.some((k) => k && lower.includes(k.toLowerCase()));
}

function countMatches(text: string, keywords: string[]) {
  const lower = text.toLowerCase();
  return keywords.filter((k) => k && lower.includes(k.toLowerCase())).length;
}

export function computeFitScore(
  input: CustomerScoringInput,
  icp: IcpConfig
): number {
  if (containsAny(`${input.company} ${input.intent}`, icp.excludedKeywords)) {
    return 10;
  }

  let score = 30;
  if (input.company.trim()) score += 15;

  if (icp.targetIndustries.length > 0) {
    if (containsAny(input.company, icp.targetIndustries)) score += 25;
  } else {
    score += 10;
  }

  if (containsAny(input.role, icp.targetRoles)) score += 20;

  const channelBonus: Record<string, number> = {
    referral: 15,
    exhibition: 12,
    partner: 10,
    phone: 8,
    website: 6
  };
  score += channelBonus[input.channel] ?? 0;

  return clamp(score);
}

export function computeIntentScore(
  input: CustomerScoringInput,
  icp: IcpConfig
): number {
  let score = 20;
  const intentText = input.intent.toLowerCase();

  score += Math.min(40, countMatches(intentText, icp.highIntentKeywords) * 12);

  if (/多少钱|报价|价格|采购|合作|演示|预约|试用/.test(intentText)) {
    score += 20;
  }

  if (input.linkedLeadLevels.includes('A')) score += 25;
  else if (input.linkedLeadLevels.includes('B')) score += 15;

  score += Math.min(15, input.activityCount * 5);

  if (input.status === 'won') score = Math.max(score, 90);
  if (input.status === 'lost') score = Math.min(score, 20);

  return clamp(score);
}

export function computeHealthScore(input: CustomerScoringInput): number {
  if (input.status === 'won') return 100;
  if (input.status === 'lost') return 0;

  let score = 100;
  const idleDays = input.daysSinceLastActivity ?? input.daysSinceCreated;

  if (idleDays > 30) score -= 50;
  else if (idleDays > 14) score -= 30;
  else if (idleDays > 7) score -= 15;

  if (input.activityCount === 0 && input.daysSinceCreated > 3) score -= 20;

  return clamp(score);
}

export function deriveSegment(
  fitScore: number,
  intentScore: number,
  healthScore: number
): CustomerScores['segment'] {
  if (healthScore < 40) return 'at_risk';
  if (intentScore >= 70 && fitScore >= 55) return 'hot';
  if (intentScore >= 40 || fitScore >= 45) return 'warm';
  return 'cold';
}

export function computeCustomerScores(
  input: CustomerScoringInput,
  icp: IcpConfig = DEFAULT_ICP_CONFIG
): CustomerScores {
  const fitScore = computeFitScore(input, icp);
  const intentScore = computeIntentScore(input, icp);
  const healthScore = computeHealthScore(input);
  const segment = deriveSegment(fitScore, intentScore, healthScore);
  return { fitScore, intentScore, healthScore, segment };
}

export function buildRuleBasedProfile(
  input: CustomerScoringInput
): RuleBasedProfile {
  const intent = input.intent.trim();
  const tags: string[] = [];
  if (input.channel === 'referral') tags.push('转介绍');
  if (input.channel === 'exhibition') tags.push('展会');
  if (/价格|报价/.test(intent)) tags.push('价格咨询');
  if (/合作|采购|企业/.test(intent)) tags.push('B2B');

  const painPoints: string[] = [];
  if (/贵|成本|预算/.test(intent)) painPoints.push('成本敏感');
  if (/效率|自动化/.test(intent)) painPoints.push('效率提升');

  const interests: string[] = [];
  if (/演示|试用/.test(intent)) interests.push('产品体验');
  if (/定制|企业版/.test(intent)) interests.push('企业方案');

  let budget: string | null = null;
  if (/预算|价格|报价/.test(intent)) budget = '待确认';

  let timeline: string | null = null;
  if (/尽快|本月|季度|紧急/.test(intent)) timeline = '近期';
  else if (/了解|看看|咨询/.test(intent)) timeline = '探索中';

  const authority = /总监|ceo|cto|负责人|经理|主管|采购/.test(input.role)
    ? '决策者或影响者'
    : null;

  return {
    industry: null,
    painPoints,
    interests,
    budget,
    timeline,
    bant: {
      budget,
      authority,
      need: intent || null,
      timeline
    },
    summary: `${input.displayName}（${input.company}·${input.role}）当前需求：${intent}`,
    tags
  };
}
