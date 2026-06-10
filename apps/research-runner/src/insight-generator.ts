import { createDatabaseClient } from '@ai-growth-ops/database';
import type { DatabaseClient } from '@ai-growth-ops/database';
import {
  buildRuleBasedInsights,
  analyzeContentThemes as _analyzeContentThemes,
  analyzeCommentSentiment as _analyzeCommentSentiment
} from '@ai-growth-ops/shared';
import type {
  GenerateInsightsInput,
  InsightResult
} from '@ai-growth-ops/shared';

// Re-export types and pure functions so existing consumers keep working.
export type { GenerateInsightsInput, InsightResult } from '@ai-growth-ops/shared';
export { analyzeContentThemes, analyzeCommentSentiment } from '@ai-growth-ops/shared';

/**
 * Build rule-based insights and persist them to the database.
 * Returns the generated InsightResult for callers that need it.
 */
export async function generateInsights(
  input: GenerateInsightsInput
): Promise<InsightResult> {
  const db: DatabaseClient = createDatabaseClient();

  try {
    const insights = buildRuleBasedInsights(input);

    // Store insights in database
    for (const insight of insights.insights) {
      await db.researchInsight.create({
        data: {
          researchTaskId: input.researchTaskId,
          type: insight.type,
          title: insight.title,
          summary: insight.summary,
          data: (insight.data ?? {}) as Parameters<typeof db.researchInsight.create>[0]['data']['data']
        }
      });
    }

    // Store opportunities
    for (const opp of insights.opportunities) {
      await db.contentOpportunity.create({
        data: {
          researchTaskId: input.researchTaskId,
          title: opp.title,
          description: opp.description,
          platforms: opp.platforms as string[],
          priority: opp.priority
        }
      });
    }

    return insights;
  } finally {
    await db.$disconnect();
  }
}
