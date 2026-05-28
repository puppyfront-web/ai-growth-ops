import type { RuntimeRequest } from '@ai-growth-ops/shared-types';
import { selectWorkflow } from '../agents/supervisor-agent.js';

export interface SupervisorGraphResult {
  workflow: 'publish' | 'auth' | 'interaction' | 'lead' | 'skill.lifecycle';
}

export function runSupervisorGraph(request: RuntimeRequest): SupervisorGraphResult {
  return {
    workflow: selectWorkflow(request),
  };
}
