import { contentAgent } from './content-agent.js';
import { publishAgent } from './publish-agent.js';
import { registerRuntimeTools } from './tools.js';

// Side-effect: register the runtime tool group into the ai-tools registry on
// the first import of this module. Idempotent (guarded in registerRuntimeTools).
registerRuntimeTools();

export function getFirstSliceAgents(): {
  content: typeof contentAgent;
  publish: typeof publishAgent;
} {
  return { content: contentAgent, publish: publishAgent };
}

export { contentAgent, publishAgent, registerRuntimeTools };
