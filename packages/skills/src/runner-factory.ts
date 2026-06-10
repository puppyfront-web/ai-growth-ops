import { DefaultSkillRunner } from './runner.js';
import { initSkills } from './index.js';

let _runner: DefaultSkillRunner | null = null;

/**
 * Get a shared, lazily-initialized DefaultSkillRunner singleton.
 * Initializes skills on first call.
 *
 * Use this instead of creating `new DefaultSkillRunner()` in each consumer.
 */
export function getSharedSkillRunner(): DefaultSkillRunner {
  if (!_runner) {
    initSkills();
    _runner = new DefaultSkillRunner();
  }
  return _runner;
}

/**
 * Reset the shared runner (useful for testing).
 */
export function resetSharedSkillRunner(): void {
  _runner = null;
}
