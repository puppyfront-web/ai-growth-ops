import type { RuntimeRequest } from '@ai-growth-ops/shared-types';
import { runSupervisorGraph } from '../graphs/supervisor-graph.js';
import { runPublishWorkflow } from './run-publish-workflow.js';

export async function runRuntimeRequest(request: RuntimeRequest) {
  const supervisor = runSupervisorGraph(request);

  if (supervisor.workflow === 'publish') {
    const payload = request.payload as {
      platforms: string[];
      title?: string;
      content: string;
      mediaFilePaths?: string[];
    };

    return runPublishWorkflow(payload);
  }

  return {
    workflow: supervisor.workflow,
    status: 'success' as const,
    results: [],
  };
}
