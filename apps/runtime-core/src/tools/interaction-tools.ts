/**
 * Interaction tool stubs — kept for backward compatibility.
 * Real reply suggestions now come from ai-tools.ts → reply-suggestion skill.
 */

/** @deprecated Use runReplySuggestion from ai-tools.ts instead. */
export function buildReplySuggestion(content: string): { text: string; confidence: number } {
  return {
    text: `可以先说说你的产品和目标，我帮你判断最适合的合作方式。原始问题：${content}`,
    confidence: 0.88,
  };
}
