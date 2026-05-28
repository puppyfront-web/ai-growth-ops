import { afterEach, describe, expect, it } from 'vitest';
import { resolveHeadedPreference } from '../../../apps/browser-runner/src/browser-session';

const ORIGINAL_HEADED = process.env.BROWSER_RUNNER_HEADED;

afterEach(() => {
  if (typeof ORIGINAL_HEADED === 'undefined') {
    delete process.env.BROWSER_RUNNER_HEADED;
  } else {
    process.env.BROWSER_RUNNER_HEADED = ORIGINAL_HEADED;
  }
});

describe('resolveHeadedPreference', () => {
  it('uses the explicit override when provided', () => {
    process.env.BROWSER_RUNNER_HEADED = 'false';
    expect(resolveHeadedPreference(true)).toBe(true);
    process.env.BROWSER_RUNNER_HEADED = 'true';
    expect(resolveHeadedPreference(false)).toBe(false);
  });

  it('falls back to env when no override is provided', () => {
    process.env.BROWSER_RUNNER_HEADED = 'true';
    expect(resolveHeadedPreference()).toBe(true);
    process.env.BROWSER_RUNNER_HEADED = 'false';
    expect(resolveHeadedPreference()).toBe(false);
  });
});
