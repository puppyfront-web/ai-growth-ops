// ── Core Types ─────────────────────────────────────────────────
export type {
  ToolDefinition,
  ToolExecutionContext,
  ToolGroup
} from './types.js';

// ── Registry ───────────────────────────────────────────────────
export {
  registerTool,
  registerToolGroup,
  getTool,
  getAllTools,
  getToolGroups,
  toolExists,
  getToolCount,
  clearRegistry
} from './tool-registry.js';

// ── Shared Utilities ───────────────────────────────────────────
export { createApiCallerFromContext } from './_shared.js';

// ── Tool Definitions ───────────────────────────────────────────
import { contentTools } from './definitions/content-tools.js';
import { publishTools } from './definitions/publish-tools.js';
import { interactionTools } from './definitions/interaction-tools.js';
import { researchTools } from './definitions/research-tools.js';
import { campaignTools } from './definitions/campaign-tools.js';
import { workflowTools } from './definitions/workflow-tools.js';
import { agentTools } from './definitions/agent-tools.js';
import { contentMediaTools } from './definitions/content-media-tools.js';
import { registerToolGroup } from './tool-registry.js';
import type { ToolGroup } from './types.js';

const allToolGroups: ToolGroup[] = [
  { name: 'content', tools: contentTools },
  { name: 'publish', tools: publishTools },
  { name: 'interaction', tools: interactionTools },
  { name: 'research', tools: researchTools },
  { name: 'campaign', tools: campaignTools },
  { name: 'workflow', tools: workflowTools },
  { name: 'agent', tools: agentTools },
  { name: 'content-media', tools: contentMediaTools }
];

// Auto-register all tool groups on import
for (const group of allToolGroups) {
  registerToolGroup(group);
}

// Re-export individual tool arrays for direct access
export {
  contentTools,
  publishTools,
  interactionTools,
  researchTools,
  campaignTools,
  workflowTools,
  agentTools,
  contentMediaTools
};
