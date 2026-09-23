import { z } from 'zod';

export const prospectingStrategyTypeSchema = z.enum([
  'pain_help',
  'solution_comparison',
  'competitor_dissatisfaction',
  'purchase_evaluation',
  'price_budget',
  'role_scenario',
  'trigger_event'
]);

const textListSchema = z.array(z.string().trim().min(1).max(100)).max(12);

export const prospectingIntentSchema = z
  .object({
    version: z.literal(1),
    summary: z.string().trim().min(1).max(300),
    offering: z.string().trim().min(1).max(200),
    targetAudience: z
      .object({
        roles: textListSchema,
        industries: textListSchema,
        organizationTypes: textListSchema,
        regions: textListSchema
      })
      .strict(),
    painPoints: textListSchema,
    useCases: textListSchema,
    buyingSignals: textListSchema,
    exclusions: textListSchema,
    ambiguities: textListSchema
  })
  .strict();

export const prospectingStrategySchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    type: prospectingStrategyTypeSchema,
    title: z.string().trim().min(1).max(80),
    rationale: z.string().trim().min(1).max(300),
    enabled: z.boolean(),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    queries: z.array(z.string().trim().min(2).max(100)).min(1).max(3),
    negativeSignals: textListSchema,
    budget: z
      .object({
        maxQueries: z.number().int().min(1).max(3),
        maxVideos: z.number().int().min(1).max(30)
      })
      .strict()
  })
  .strict();

export const prospectingPlanSchema = z
  .object({
    version: z.literal(1),
    requirement: z.string().trim().min(20).max(2000),
    intent: prospectingIntentSchema,
    strategies: z.array(prospectingStrategySchema).min(2).max(7),
    limits: z
      .object({
        maxTotalQueries: z.number().int().min(2).max(12),
        maxTotalVideos: z.number().int().min(1).max(60),
        maxCommentsPerVideo: z.number().int().min(5).max(50)
      })
      .strict()
  })
  .strict()
  .superRefine((plan, ctx) => {
    const ids = plan.strategies.map((strategy) => strategy.id);
    const types = plan.strategies.map((strategy) => strategy.type);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['strategies'],
        message: '策略 ID 不能重复'
      });
    }
    if (new Set(types).size !== types.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['strategies'],
        message: '策略类型不能重复'
      });
    }
    const enabled = plan.strategies.filter((strategy) => strategy.enabled);
    if (enabled.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['strategies'],
        message: '至少启用两种获客策略'
      });
    }
    const queryCount = enabled.reduce(
      (total, strategy) => total + new Set(strategy.queries).size,
      0
    );
    if (queryCount > plan.limits.maxTotalQueries) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['strategies'],
        message: '策略查询总数超过计划上限'
      });
    }
  });

export type ProspectingIntent = z.infer<typeof prospectingIntentSchema>;
export type ProspectingStrategy = z.infer<typeof prospectingStrategySchema>;
export type ProspectingStrategyType = z.infer<
  typeof prospectingStrategyTypeSchema
>;
export type ProspectingPlan = z.infer<typeof prospectingPlanSchema>;
export type ProspectAttribution = {
  strategyId: string;
  strategyType: ProspectingStrategyType;
  query: string;
  evidenceIds: string[];
};

export function mergeProspectAttributions(
  current: ProspectAttribution[],
  incoming: ProspectAttribution[]
): ProspectAttribution[] {
  const merged = new Map<string, ProspectAttribution>();
  for (const item of [...current, ...incoming]) {
    const key = `${item.strategyId}:${item.query}`;
    const previous = merged.get(key);
    merged.set(key, {
      ...item,
      evidenceIds: [
        ...new Set([...(previous?.evidenceIds ?? []), ...item.evidenceIds])
      ]
    });
  }
  return [...merged.values()];
}

export function normalizeProspectingPlan(
  value: unknown,
  availableVideos: number
): ProspectingPlan {
  const parsed = prospectingPlanSchema.parse(value);
  let remainingVideos = Math.max(
    0,
    Math.min(availableVideos, parsed.limits.maxTotalVideos)
  );
  const prioritized = parsed.strategies
    .filter((strategy) => strategy.enabled)
    .map((strategy, index) => ({ strategy, index }))
    .sort(
      (left, right) =>
        left.strategy.priority - right.strategy.priority ||
        left.index - right.index
    );
  const selected = prioritized.slice(
    0,
    Math.min(prioritized.length, remainingVideos)
  );
  const minimumBudgets = new Map(
    selected.map(({ strategy }) => [strategy.id, 1])
  );
  remainingVideos -= selected.length;
  const normalized = new Map<string, ProspectingStrategy>();
  prioritized.forEach(({ strategy }) => {
    const queries = [...new Set(strategy.queries.map((query) => query.trim()))];
    const minimum = minimumBudgets.get(strategy.id) ?? 0;
    if (minimum === 0) {
      normalized.set(strategy.id, {
        ...strategy,
        enabled: false,
        queries,
        budget: { ...strategy.budget, maxVideos: 0 }
      });
      return;
    }
    const extra = Math.min(
      Math.max(0, strategy.budget.maxVideos - minimum),
      remainingVideos
    );
    const maxVideos = minimum + extra;
    remainingVideos -= extra;
    normalized.set(strategy.id, {
      ...strategy,
      enabled: maxVideos > 0,
      queries,
      budget: {
        maxQueries: Math.min(strategy.budget.maxQueries, queries.length),
        maxVideos
      }
    });
  });
  for (const strategy of parsed.strategies.filter((item) => !item.enabled)) {
    normalized.set(strategy.id, {
      ...strategy,
      queries: [...new Set(strategy.queries.map((query) => query.trim()))]
    });
  }
  const strategies = parsed.strategies.map(
    (strategy) => normalized.get(strategy.id) ?? strategy
  );

  return {
    ...parsed,
    strategies,
    limits: {
      ...parsed.limits,
      maxTotalVideos: Math.min(
        parsed.limits.maxTotalVideos,
        Math.max(0, availableVideos)
      )
    }
  };
}
