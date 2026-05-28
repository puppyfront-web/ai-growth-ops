import type { RuntimeRequest } from '@ai-growth-ops/shared-types';

export function selectWorkflow(
  request: RuntimeRequest,
): 'publish' | 'auth' | 'interaction' | 'lead' | 'skill.lifecycle' {
  if (request.intent === 'publish') return 'publish';
  if (request.intent === 'auth.check' || request.intent === 'auth.login') return 'auth';
  if (request.intent === 'skill.lifecycle') return 'skill.lifecycle';
  if (request.intent === 'lead.extract') return 'lead';
  return 'interaction';
}
