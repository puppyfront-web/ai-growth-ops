import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Load .env from the monorepo root (mirrors apps/browser-runner/src/server.ts).
 * The built file lives at packages/growth-ops-agent/dist/index.js, so three
 * `..` hops reach the workspace root. Values already in process.env win.
 */
function loadRootEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '..', '..', '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadRootEnv();

export interface PublishArgs {
  platform: string;
  cookie: string;
  contentType: string;
  content: string;
  title?: string;
  tags?: string[];
  mediaFilePaths?: string[];
  mediaUrls?: string[];
  publishJobId?: string;
}

/**
 * Thin HTTP client for the browser-runner service. Every call carries the
 * shared Bearer secret (BROWSER_RUNNER_SECRET || TOKEN_ENCRYPTION_KEY); in dev
 * with no secret configured, browser-runner allows all requests.
 */
export class BrowserRunnerClient {
  private readonly baseUrl: string;
  private readonly secret: string;

  constructor(opts?: { baseUrl?: string; secret?: string }) {
    this.baseUrl = (
      opts?.baseUrl ??
      process.env.BROWSER_RUNNER_URL ??
      'http://localhost:3200'
    ).replace(/\/$/, '');
    this.secret =
      opts?.secret ??
      process.env.BROWSER_RUNNER_SECRET ??
      process.env.TOKEN_ENCRYPTION_KEY ??
      '';
  }

  private async request<T = unknown>(
    path: string,
    init?: { method?: string; body?: unknown }
  ): Promise<T> {
    const method = init?.method ?? 'POST';
    const headers: Record<string, string> = {
      'content-type': 'application/json'
    };
    if (this.secret) headers.authorization = `Bearer ${this.secret}`;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined
    });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        /* keep json null */
      }
    }
    if (!res.ok) {
      const msg =
        (json as { error?: string } | null)?.error ?? text ?? `HTTP ${res.status}`;
      throw new Error(`browser-runner ${path} → ${res.status}: ${msg}`);
    }
    return json as T;
  }

  // ── session / login ──
  startSession(platform: string) {
    return this.request<{ sessionId: string; status: string }>(
      '/session/start',
      { body: { platform } }
    );
  }
  sessionStatus(sessionId: string) {
    return this.request<{
      status: string;
      cookies?: string;
      error?: string;
    }>(`/session/${sessionId}/status`, { method: 'GET' });
  }
  cancelSession(sessionId: string) {
    return this.request(`/session/${sessionId}/cancel`, { body: {} });
  }

  // ── content ──
  listVideos(platform: string, cookie: string, limit?: number) {
    return this.request<unknown[]>('/assist/list-videos', {
      body: { platform, cookie, limit }
    });
  }

  // ── interaction (read) ──
  fetchComments(
    platform: string,
    cookie: string,
    opts?: { sourceContentId?: string; limit?: number }
  ) {
    return this.request<unknown[]>('/assist/fetch-comments', {
      body: { platform, cookie, ...opts }
    });
  }
  fetchMessages(platform: string, cookie: string, opts?: { limit?: number }) {
    return this.request<unknown[]>('/assist/fetch-messages', {
      body: { platform, cookie, ...opts }
    });
  }

  // ── interaction (write) ──
  replyComment(
    platform: string,
    cookie: string,
    externalCommentId: string,
    replyText: string,
    sourceContentId?: string
  ) {
    return this.request('/assist/reply-comment', {
      body: { platform, cookie, externalCommentId, replyText, sourceContentId }
    });
  }
  replyMessage(
    platform: string,
    cookie: string,
    externalUserId: string,
    messageText: string
  ) {
    return this.request('/assist/reply-message', {
      body: { platform, cookie, externalUserId, messageText }
    });
  }

  // ── prospecting ──
  searchComments(
    platform: string,
    cookie: string,
    keyword: string,
    opts?: { topN?: number }
  ) {
    return this.request('/assist/search-and-fetch-comments', {
      body: { platform, cookie, keyword, ...opts }
    });
  }

  // ── publish ──
  publish(args: PublishArgs) {
    return this.request('/assist/publish', { body: args });
  }
  checkPublishStatus(
    platform: string,
    cookie: string,
    opts?: { externalPostId?: string; contentManagementUrl?: string }
  ) {
    return this.request('/assist/check-publish-status', {
      body: { platform, cookie, ...opts }
    });
  }
}
