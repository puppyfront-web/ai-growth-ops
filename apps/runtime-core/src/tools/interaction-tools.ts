export function buildReplySuggestion(content: string): { text: string; confidence: number } {
  return {
    text: `可以先说说你的产品和目标，我帮你判断最适合的合作方式。原始问题：${content}`,
    confidence: 0.88,
  };
}
