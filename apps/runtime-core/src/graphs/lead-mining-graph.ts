import type { LeadLevel, LevelBreakdown } from '../tools/lead-tools.js';

// ── Input ──────────────────────────────────────────────────────────

export interface LeadCandidate {
  platform: string;
  interactionType: 'comment' | 'message';
  content: string;
  sourceContentTitle?: string;
  userNickname?: string;
}

// ── Output ─────────────────────────────────────────────────────────

export interface ClassificationDetail {
  intent: string;
  leadLevel: LeadLevel;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
  tags: string[];
  nextAction: string;
}

export interface ReplySuggestionDetail {
  suggestedText: string;
  replyType: string;
  riskLevel: 'low' | 'medium' | 'high';
  needReview: boolean;
  reason?: string;
}

export interface ClassifiedLead {
  platform: string;
  interactionType: string;
  originalContent: string;
  userNickname?: string;
  classification: ClassificationDetail;
  replySuggestion?: ReplySuggestionDetail;
  /** Whether classification came from LLM or rule-based fallback. */
  classificationSource: 'llm' | 'rules';
  replySource?: 'llm' | 'rules';
}

export interface LeadMiningResult {
  status: 'success' | 'partial' | 'failed';
  totalCandidates: number;
  classified: number;
  leads: ClassifiedLead[];
  levelBreakdown: LevelBreakdown;
  errors: string[];
}

// ── Graph factory ──────────────────────────────────────────────────

export function createLeadMiningGraph(
  executor: (input: {
    candidates: LeadCandidate[];
  }) => Promise<LeadMiningResult>
): { run(input: { candidates: LeadCandidate[] }): Promise<LeadMiningResult> } {
  return {
    run: executor
  };
}
