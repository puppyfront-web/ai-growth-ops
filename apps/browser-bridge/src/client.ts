import type { BrowserBridgeArgs } from './config.js';

export interface BrowserBridgeSession {
  sessionId: string;
  platformAccountId: string;
  platform: string;
  status: 'waiting_user';
  loginUrl: string;
  allowedOrigins: string[];
  cookieDomains: string[];
  requiredCookieNames: string[];
  cookieNames: string[];
  profileRef: string;
  expiresAt: string;
}

export class BrowserBridgeClient {
  constructor(private readonly args: BrowserBridgeArgs) {}

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(
      `${this.args.apiUrl}/api/browser-bridge/sessions/${this.args.sessionId}${path}`,
      {
        ...init,
        headers: {
          authorization: `Bearer ${this.args.token}`,
          ...(init.body ? { 'content-type': 'application/json' } : {})
        },
        signal: AbortSignal.timeout(15_000)
      }
    );
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(String(body.code ?? body.error ?? `HTTP_${response.status}`));
    }
    return body;
  }

  async claim(): Promise<BrowserBridgeSession> {
    return (await this.request('')) as unknown as BrowserBridgeSession;
  }

  async complete(cookies: string): Promise<void> {
    await this.request('/complete', {
      method: 'POST',
      body: JSON.stringify({ cookies })
    });
  }

  async fail(code: string, message: string): Promise<void> {
    await this.request('/error', {
      method: 'POST',
      body: JSON.stringify({ code, message })
    });
  }
}
