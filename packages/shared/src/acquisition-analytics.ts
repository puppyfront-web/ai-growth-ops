export const ACQUISITION_RANGE_DAYS = [7, 30, 90] as const;
export const DEFAULT_ACQUISITION_DAYS = 30;
const MAX_ACQUISITION_DAYS = 180;

export type AcquisitionTaskRow = {
  id: string;
  platform: string;
  keywords: string[];
  status: string;
  totalVideos: number;
  totalComments: number;
  createdAt: string;
};

export type AcquisitionCandidateRow = {
  id: string;
  taskId: string;
  platform: string;
  keyword: string;
  relevanceScore: number;
  leadLevel: string;
  customerId: string | null;
  createdAt: string;
  convertedAt?: string | null;
};

export type AcquisitionCustomerRow = {
  id: string;
  status: string;
  channel: string;
  fitScore: number;
  intentScore: number;
  healthScore: number;
  segment: string | null;
  createdAt: string;
};

export type AcquisitionFunnelStage = {
  key: string;
  label: string;
  count: number;
  rateFromPrev: number;
  rateFromStart: number;
};

export type AcquisitionCountRow = {
  key: string;
  label?: string;
  count: number;
  converted: number;
};

export type AcquisitionKeywordRow = {
  keyword: string;
  candidates: number;
  avgScore: number;
  converted: number;
  conversionRate: number;
};

export type AcquisitionTaskSummary = {
  id: string;
  platform: string;
  keywords: string[];
  status: string;
  videos: number;
  comments: number;
  candidates: number;
  converted: number;
  createdAt: string;
};

export type AcquisitionTrendPoint = {
  date: string;
  candidates: number;
  converted: number;
};

export type AcquisitionAnalytics = {
  range: { from: string; to: string; days: number };
  kpis: {
    tasks: number;
    completedTasks: number;
    videos: number;
    comments: number;
    candidates: number;
    highIntent: number;
    convertedCustomers: number;
    conversionRate: number;
    wonCustomers: number;
    avgScore: number;
  };
  funnel: AcquisitionFunnelStage[];
  trend: AcquisitionTrendPoint[];
  byLevel: AcquisitionCountRow[];
  byScoreBand: AcquisitionCountRow[];
  byPlatform: AcquisitionCountRow[];
  byKeyword: AcquisitionKeywordRow[];
  byCustomerStatus: Array<{ status: string; count: number }>;
  recentTasks: AcquisitionTaskSummary[];
};

export function clampAcquisitionDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_ACQUISITION_DAYS;
  return Math.min(MAX_ACQUISITION_DAYS, Math.max(1, Math.round(days)));
}

export function resolveAcquisitionRange(
  days: number,
  now = new Date()
): { from: Date; to: Date; days: number } {
  const clamped = clampAcquisitionDays(days);
  const to = now;
  const from = new Date(to.getTime() - clamped * 24 * 60 * 60 * 1000);
  return { from, to, days: clamped };
}

export function asKeywordList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0
  );
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function conversionDay(row: AcquisitionCandidateRow): string | null {
  if (!row.customerId) return null;
  if (row.convertedAt) return dayKey(row.convertedAt);
  return dayKey(row.createdAt);
}

function rate(count: number, base: number): number {
  if (base <= 0) return 0;
  return Math.round((count / base) * 100);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export const HIGH_INTENT_MIN_SCORE = 70;

export function isHighIntentCandidate(row: {
  leadLevel: string;
  relevanceScore: number;
}): boolean {
  if (row.leadLevel === 'A') return true;
  return row.leadLevel === 'B' && row.relevanceScore >= HIGH_INTENT_MIN_SCORE;
}

function scoreBand(score: number): string {
  if (score >= 80) return '80-100';
  if (score >= 60) return '60-79';
  if (score >= 40) return '40-59';
  return '0-39';
}

function eachDate(fromIso: string, toIso: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${dayKey(fromIso)}T00:00:00.000Z`);
  const end = new Date(`${dayKey(toIso)}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function funnelStage(
  key: string,
  label: string,
  count: number,
  prev: number,
  start: number
): AcquisitionFunnelStage {
  return {
    key,
    label,
    count,
    rateFromPrev: prev <= 0 ? 0 : rate(count, prev),
    rateFromStart: rate(count, start)
  };
}

export function buildAcquisitionAnalytics(input: {
  from: Date;
  to: Date;
  days: number;
  tasks: AcquisitionTaskRow[];
  candidates: AcquisitionCandidateRow[];
  customers: AcquisitionCustomerRow[];
}): AcquisitionAnalytics {
  const customersById = new Map(input.customers.map((row) => [row.id, row]));
  const convertedIds = new Set(
    input.candidates
      .map((row) => row.customerId)
      .filter((id): id is string => Boolean(id))
  );
  const convertedCustomers = [...convertedIds]
    .map((id) => customersById.get(id))
    .filter((row): row is AcquisitionCustomerRow => Boolean(row));
  const highIntent = input.candidates.filter(isHighIntentCandidate).length;
  const wonCustomers = convertedCustomers.filter((row) => row.status === 'won').length;
  const start = input.candidates.length;

  const levels = ['A', 'B', 'C', 'D'] as const;
  const byLevel = levels.map((level) => ({
    key: level,
    label: `${level}级`,
    count: input.candidates.filter((row) => row.leadLevel === level).length,
    converted: input.candidates.filter(
      (row) => row.leadLevel === level && row.customerId
    ).length
  }));

  const bands = ['0-39', '40-59', '60-79', '80-100'] as const;
  const byScoreBand = bands.map((band) => ({
    key: band,
    count: input.candidates.filter((row) => scoreBand(row.relevanceScore) === band)
      .length,
    converted: input.candidates.filter(
      (row) => scoreBand(row.relevanceScore) === band && row.customerId
    ).length
  }));

  const platformMap = new Map<string, { count: number; convertedIds: Set<string> }>();
  for (const row of input.candidates) {
    const current = platformMap.get(row.platform) ?? {
      count: 0,
      convertedIds: new Set<string>()
    };
    current.count += 1;
    if (row.customerId) current.convertedIds.add(row.customerId);
    platformMap.set(row.platform, current);
  }
  for (const task of input.tasks) {
    if (!platformMap.has(task.platform)) {
      platformMap.set(task.platform, { count: 0, convertedIds: new Set() });
    }
  }
  const byPlatform = [...platformMap.entries()]
    .map(([key, value]) => ({
      key,
      count: value.count,
      converted: value.convertedIds.size
    }))
    .sort((a, b) => b.count - a.count || b.converted - a.converted);

  const keywordMap = new Map<
    string,
    { candidates: number; scoreSum: number; converted: number }
  >();
  for (const row of input.candidates) {
    const keyword = row.keyword.trim() || '未标注';
    const current = keywordMap.get(keyword) ?? {
      candidates: 0,
      scoreSum: 0,
      converted: 0
    };
    current.candidates += 1;
    current.scoreSum += row.relevanceScore;
    if (row.customerId) current.converted += 1;
    keywordMap.set(keyword, current);
  }
  const byKeyword = [...keywordMap.entries()]
    .map(([keyword, value]) => ({
      keyword,
      candidates: value.candidates,
      avgScore: Math.round(value.scoreSum / Math.max(value.candidates, 1)),
      converted: value.converted,
      conversionRate: rate(value.converted, value.candidates)
    }))
    .sort(
      (a, b) =>
        b.converted - a.converted ||
        b.candidates - a.candidates ||
        b.avgScore - a.avgScore
    )
    .slice(0, 15);

  const statusOrder = ['active', 'inactive', 'won', 'lost'] as const;
  const statusCounts = new Map<string, number>();
  for (const row of convertedCustomers) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  }
  const byCustomerStatus = statusOrder.map((status) => ({
    status,
    count: statusCounts.get(status) ?? 0
  }));

  const candidatesByTask = new Map<string, AcquisitionCandidateRow[]>();
  for (const row of input.candidates) {
    const list = candidatesByTask.get(row.taskId) ?? [];
    list.push(row);
    candidatesByTask.set(row.taskId, list);
  }
  const recentTasks = [...input.tasks]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)
    .map((task) => {
      const rows = candidatesByTask.get(task.id) ?? [];
      return {
        id: task.id,
        platform: task.platform,
        keywords: task.keywords,
        status: task.status,
        videos: task.totalVideos,
        comments: task.totalComments,
        candidates: rows.length,
        converted: new Set(rows.map((row) => row.customerId).filter(Boolean)).size,
        createdAt: task.createdAt
      };
    });

  const fromIso = input.from.toISOString();
  const toIso = input.to.toISOString();
  const convertedByDate = new Map<string, Set<string>>();
  const candidateByDate = new Map<string, number>();
  for (const row of input.candidates) {
    const key = dayKey(row.createdAt);
    candidateByDate.set(key, (candidateByDate.get(key) ?? 0) + 1);
    const convertedKey = conversionDay(row);
    if (convertedKey && row.customerId) {
      const set = convertedByDate.get(convertedKey) ?? new Set<string>();
      set.add(row.customerId);
      convertedByDate.set(convertedKey, set);
    }
  }
  const trend = eachDate(fromIso, toIso).map((date) => ({
    date,
    candidates: candidateByDate.get(date) ?? 0,
    converted: convertedByDate.get(date)?.size ?? 0
  }));

  return {
    range: { from: fromIso, to: toIso, days: input.days },
    kpis: {
      tasks: input.tasks.length,
      completedTasks: input.tasks.filter((task) => task.status === 'completed')
        .length,
      videos: input.tasks.reduce((sum, task) => sum + task.totalVideos, 0),
      comments: input.tasks.reduce((sum, task) => sum + task.totalComments, 0),
      candidates: input.candidates.length,
      highIntent,
      convertedCustomers: convertedCustomers.length,
      conversionRate: rate(convertedCustomers.length, input.candidates.length),
      wonCustomers,
      avgScore: avg(input.candidates.map((row) => row.relevanceScore))
    },
    funnel: [
      funnelStage(
        'candidates',
        '识别潜客',
        input.candidates.length,
        input.candidates.length,
        start
      ),
      funnelStage('highIntent', '高意向', highIntent, input.candidates.length, start),
      funnelStage(
        'converted',
        '转入客户',
        convertedCustomers.length,
        highIntent,
        start
      ),
      funnelStage('won', '成交', wonCustomers, convertedCustomers.length, start)
    ],
    trend,
    byLevel,
    byScoreBand,
    byPlatform,
    byKeyword,
    byCustomerStatus,
    recentTasks
  };
}
