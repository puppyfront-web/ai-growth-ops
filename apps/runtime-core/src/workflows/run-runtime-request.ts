import type { RuntimeRequest } from '@ai-growth-ops/shared-types';
import { runSupervisorGraph } from '../graphs/supervisor-graph.js';
import { runAuthWorkflow } from './run-auth-workflow.js';
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

  if (supervisor.workflow === 'auth') {
    const payload = request.payload as {
      platform: string;
      account?: string;
    };
    return runAuthWorkflow({
      action: request.intent === 'auth.login' ? 'login' : 'check',
      platform: payload.platform,
      account: payload.account,
    });
  }

  return {
    workflow: supervisor.workflow,
    status: 'success' as const,
    results: [],
  };
}
