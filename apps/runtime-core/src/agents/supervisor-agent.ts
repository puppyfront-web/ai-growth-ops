import type { RuntimeRequest } from '@ai-growth-ops/shared-types';

export function selectWorkflow(
  request: RuntimeRequest,
): 'publish' | 'interaction' | 'lead' | 'skill.lifecycle' {
  if (request.intent === 'publish') return 'publish';
  if (request.intent === 'skill.lifecycle') return 'skill.lifecycle';
  if (request.intent === 'lead.extract') return 'lead';
  return 'interaction';
}
