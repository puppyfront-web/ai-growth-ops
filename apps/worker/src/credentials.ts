import { decryptToken } from '@ai-growth-ops/providers';
import type { CredentialResolver } from '@ai-growth-ops/runtime';
import type { DatabaseClient } from '@ai-growth-ops/database';

export type DecryptFn = (encrypted: string) => string;

/**
 * DB-backed CredentialResolver for scheduled mode. Resolves a platform cookie from
 * the active PlatformAccount.cookieRef, decrypting server-side. Mirrors the legacy
 * handler pattern (interaction.sync-comments.ts) and the host-mode EnvCredentialResolver
 * contract — cookie never enters the LLM context.
 *
 * `decrypt` is injectable so tests can avoid the TOKEN_ENCRYPTION_KEY requirement.
 */
export function createDbCredentialResolver(db: DatabaseClient, decrypt: DecryptFn = decryptToken): CredentialResolver {
  return {
    async getCookie(userId, _orgId, platform) {
      const account = await db.platformAccount.findFirst({
        where: {
          userId,
          platform: platform as never,
          status: 'active' as never,
          deletedAt: null
        },
        select: { cookieRef: true }
      });
      if (!account?.cookieRef) return undefined;
      try {
        return decrypt(account.cookieRef);
      } catch {
        // A malformed/undecryptable cookieRef should not crash the run — treat as absent.
        return undefined;
      }
    }
  };
}
