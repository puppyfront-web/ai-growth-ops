export { DefaultSkillRunner } from './runner.js';
export { registerSkill, getSkill, listSkills, skillExists, discoverSkills } from './registry.js';
export type { SkillRunner, SkillDefinition, SkillRunResult, SkillContext } from './types.js';

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { discoverSkills } from './registry.js';

const _pkgRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
const _defaultDefinitionsDir = resolve(_pkgRoot, 'definitions');

/**
 * Auto-discover and register all built-in skills from the definitions directory.
 * Call once at application startup in api and worker.
 */
export function initSkills(definitionsDir?: string): void {
  discoverSkills(definitionsDir ?? _defaultDefinitionsDir);
}
