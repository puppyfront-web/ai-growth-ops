import type { CredentialResolver } from './types.js';

/**
 * Resolves a platform cookie from `AI_GROWTH_OPS_<PLATFORM>_COOKIE`.
 * First-slice resolver; production swaps to a PlatformAccount/cookieRef DB resolver.
 * Cookie is injected server-side by the executor and never shown to the host LLM.
 */
export class EnvCredentialResolver implements CredentialResolver {
  constructor(private readonly env: Record<string, string | undefined> = process.env) {}
  async getCookie(_userId: string, _orgId: string, platform: string): Promise<string | undefined> {
    const key = `AI_GROWTH_OPS_${platform.toUpperCase()}_COOKIE`;
    return this.env[key];
  }
}
