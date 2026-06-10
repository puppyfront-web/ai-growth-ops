import type { ToolDefinition, ToolGroup } from './types.js';

// ── In-memory Registry ─────────────────────────────────────────

const toolMap = new Map<string, ToolDefinition>();
const groups: ToolGroup[] = [];

/**
 * Register a tool. Throws if a tool with the same name already exists.
 */
export function registerTool(tool: ToolDefinition): void {
  if (toolMap.has(tool.name)) {
    throw new Error(`Tool already registered: ${tool.name}`);
  }
  toolMap.set(tool.name, tool);
}

/**
 * Register a group of tools.
 */
export function registerToolGroup(group: ToolGroup): void {
  groups.push(group);
  for (const tool of group.tools) {
    registerTool(tool);
  }
}

/**
 * Get a tool by name, or undefined if not found.
 */
export function getTool(name: string): ToolDefinition | undefined {
  return toolMap.get(name);
}

/**
 * Get all registered tools.
 */
export function getAllTools(): ToolDefinition[] {
  return Array.from(toolMap.values());
}

/**
 * Get all tool groups.
 */
export function getToolGroups(): ToolGroup[] {
  return [...groups];
}

/**
 * Check if a tool is registered.
 */
export function toolExists(name: string): boolean {
  return toolMap.has(name);
}

/**
 * Get the total count of registered tools.
 */
export function getToolCount(): number {
  return toolMap.size;
}

/**
 * Clear all registrations (useful for testing).
 */
export function clearRegistry(): void {
  toolMap.clear();
  groups.length = 0;
}
