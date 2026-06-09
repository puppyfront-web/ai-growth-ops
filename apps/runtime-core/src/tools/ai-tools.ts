/**
 * AI-powered classification and reply suggestion with graceful
 * fallback to rule-based logic when the LLM is unavailable.
 *
 * Uses @ai-growth-ops/skills DefaultSkillRunner with the built-in
 * lead-classification and reply-suggestion skill definitions.
 */

import { DefaultSkillRunner, initSkills } from '@ai-growth-ops/skills';
import {
  classifyByRules,
  generateRuleBasedReply,
  containsSensitiveContent,
  type ClassificationResult,
  type ReplySuggestionResult
} from './rule-classifier.js';

// ── Lazy singleton skill runner ────────────────────────────────────

let _runner: DefaultSkillRunner | null = null;

export function getSkillRunner(): DefaultSkillRunner {
  if (!_runner) {
    initSkills();
    _runner = new DefaultSkillRunner();
  }
  return _runner;
}

/** Reset the singleton (for testing only). */
export function resetSkillRunner(): void {
  _runner = null;
}

// ── Classification ─────────────────────────────────────────────────

export interface ClassificationInput {
  platform: string;
  interactionType: string;
  content: string;
  sourceContentTitle?: string;
}

export async function runClassification(
  input: ClassificationInput
): Promise<{ result: ClassificationResult; source: 'llm' | 'rules' }> {
  try {
    const runner = getSkillRunner();
    const skillResult = await runner.run<
      ClassificationInput,
      ClassificationResult
    >({
      skillName: 'lead-classification',
      input: {
        platform: input.platform,
        interactionType: input.interactionType,
        content: input.content,
        sourceContentTitle: input.sourceContentTitle
      }
    });

    if (skillResult.status === 'success' && skillResult.output) {
      return { result: skillResult.output, source: 'llm' };
    }

    console.error(
      '[ai-tools] lead-classification skill returned failure:',
      skillResult.error
    );
  } catch (error) {
    console.error('[ai-tools] lead-classification skill error:', error);
  }

  return { result: classifyByRules(input.content), source: 'rules' };
}

// ── Reply Suggestion ───────────────────────────────────────────────

export interface ReplySuggestionInput {
  interaction: {
    content: string;
    platform: string;
    type: string;
  };
  classification: ClassificationResult;
  brandTone?: string;
}

export async function runReplySuggestion(
  input: ReplySuggestionInput
): Promise<{ result: ReplySuggestionResult; source: 'llm' | 'rules' } | null> {
  try {
    const runner = getSkillRunner();
    const skillResult = await runner.run<
      Record<string, unknown>,
      Record<string, unknown>
    >({
      skillName: 'reply-suggestion',
      input: {
        interaction: input.interaction,
        classification: input.classification,
        platform: input.interaction.platform,
        brandTone: input.brandTone || '专业、克制、不过度承诺'
      }
    });

    if (skillResult.status === 'success' && skillResult.output) {
      const output = skillResult.output;
      const result: ReplySuggestionResult = {
        suggestedText: String(output.suggestedText || ''),
        replyType: String(output.replyType || 'faq_answer'),
        riskLevel: (['low', 'medium', 'high'].includes(String(output.riskLevel))
          ? output.riskLevel
          : 'low') as ReplySuggestionResult['riskLevel'],
        needReview: Boolean(output.needReview),
        reason: output.reason ? String(output.reason) : undefined
      };
      return { result, source: 'llm' };
    }

    console.error(
      '[ai-tools] reply-suggestion skill returned failure:',
      skillResult.error
    );
  } catch (error) {
    console.error('[ai-tools] reply-suggestion skill error:', error);
  }

  // Rule-based fallback
  const result = generateRuleBasedReply(
    input.interaction.content,
    input.classification,
    input.interaction.platform
  );

  // Apply sensitive content policy check
  if (containsSensitiveContent(result.suggestedText)) {
    result.needReview = true;
    result.reason = 'Contains sensitive content (phone/URL/email)';
  }

  return { result, source: 'rules' };
}
