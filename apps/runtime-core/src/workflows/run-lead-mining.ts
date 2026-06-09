import {
  createLeadMiningGraph,
  type LeadCandidate,
  type LeadMiningResult,
  type ClassifiedLead
} from '../graphs/lead-mining-graph.js';
import { buildLeadBreakdown } from '../tools/lead-tools.js';
import { runClassification, runReplySuggestion } from '../tools/ai-tools.js';
import type { ClassificationResult } from '../tools/rule-classifier.js';

export async function runLeadMining(input: {
  candidates: LeadCandidate[];
}): Promise<LeadMiningResult> {
  const graph = createLeadMiningGraph(async ({ candidates }) => {
    const leads: ClassifiedLead[] = [];
    const errors: string[] = [];

    for (const candidate of candidates) {
      try {
        // Step 1: Classify (LLM with rule fallback)
        const { result: classification, source: classSource } =
          await runClassification({
            platform: candidate.platform,
            interactionType: candidate.interactionType,
            content: candidate.content,
            sourceContentTitle: candidate.sourceContentTitle
          });

        // Step 2: Generate reply suggestion (skip for D-level / spam)
        let reply: ClassifiedLead['replySuggestion'] = undefined;
        let replySource: ClassifiedLead['replySource'] = undefined;

        if (classification.leadLevel !== 'D') {
          try {
            const replyResult = await runReplySuggestion({
              interaction: {
                content: candidate.content,
                platform: candidate.platform,
                type: candidate.interactionType
              },
              classification
            });
            if (replyResult) {
              reply = replyResult.result;
              replySource = replyResult.source;
            }
          } catch (error) {
            errors.push(
              `Reply suggestion failed for "${candidate.content.slice(0, 30)}...": ${
                error instanceof Error ? error.message : String(error)
              }`
            );
            // Reply failure does not block lead classification
          }
        }

        leads.push({
          platform: candidate.platform,
          interactionType: candidate.interactionType,
          originalContent: candidate.content,
          userNickname: candidate.userNickname,
          classification: normalizeClassification(classification),
          replySuggestion: reply,
          classificationSource: classSource,
          replySource
        });
      } catch (error) {
        errors.push(
          `Classification failed for "${candidate.content.slice(0, 30)}...": ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    const status: LeadMiningResult['status'] =
      leads.length === 0
        ? 'failed'
        : leads.length < candidates.length
          ? 'partial'
          : 'success';

    return {
      status,
      totalCandidates: candidates.length,
      classified: leads.length,
      leads,
      levelBreakdown: buildLeadBreakdown(leads),
      errors
    };
  });

  return graph.run(input);
}

/** Ensure all required fields have sensible defaults. */
function normalizeClassification(
  raw: ClassificationResult
): ClassifiedLead['classification'] {
  return {
    intent: raw.intent || 'unknown',
    leadLevel: raw.leadLevel || 'C',
    confidence: raw.confidence ?? 0.5,
    riskLevel: raw.riskLevel || 'low',
    summary: raw.summary || '',
    tags: raw.tags || [],
    nextAction: raw.nextAction || 'suggest_reply'
  };
}
