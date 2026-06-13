import { readFileSync } from 'node:fs';

interface SessionEntry {
  cookie: string;
  sessionId?: string;
  loggedInAt?: string;
}

/**
 * Owns per-platform auth state for the MCP server so the model never has to
 * handle multi-KB cookie strings. A cookie is populated either by a successful
 * `auth_login` → `auth_status` handshake, or pre-seeded from a file (testing).
 */
export class SessionStore {
  private byPlatform = new Map<string, SessionEntry>();
  private platformBySessionId = new Map<string, string>();

  recordPending(sessionId: string, platform: string) {
    this.platformBySessionId.set(sessionId, platform);
  }

  platformFor(sessionId: string): string | undefined {
    return this.platformBySessionId.get(sessionId);
  }

  set(platform: string, entry: SessionEntry) {
    this.byPlatform.set(platform, entry);
  }

  getCookie(platform: string): string | undefined {
    return this.byPlatform.get(platform)?.cookie;
  }

  /** Throws a clear, model-actionable error when no cookie is available. */
  requireCookie(platform: string): string {
    const cookie = this.getCookie(platform);
    if (!cookie) {
      throw new Error(
        `No authenticated session for platform "${platform}". Call the \`auth_login\` tool (then \`auth_status\`), or seed a cookie via the GROWTH_OPS_COOKIE_FILE env var.`
      );
    }
    return cookie;
  }

  /** Pre-seed a cookie from disk — used for testing without a QR scan. */
  seedFromFile(path: string, platform = 'douyin') {
    const cookie = readFileSync(path, 'utf-8').trim();
    if (cookie) this.byPlatform.set(platform, { cookie });
    return cookie.length;
  }
}
