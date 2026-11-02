interface LoginSessionMeta {
  /** 首次 start 响应的运行形态——复用会话时必须原样带回，丢失会让前端弹窗退回二维码分支。 */
  headed: boolean;
  qrImage?: string;
}

interface LoginSession {
  sessionId: string;
  accountId: string;
  startedAt: Date;
  meta?: LoginSessionMeta;
}

const sessions = new Map<string, LoginSession>();
const pendingStarts = new Set<string>();

export function setSession(
  accountId: string,
  sessionId: string,
  meta?: LoginSessionMeta
): void {
  sessions.set(accountId, {
    sessionId,
    accountId,
    startedAt: new Date(),
    meta
  });
}

export function getSessionId(accountId: string): string | null {
  return sessions.get(accountId)?.sessionId ?? null;
}

export function clearSession(accountId: string): void {
  sessions.delete(accountId);
}

/** Returns false if a session is already being created for this account. */
export function markPending(accountId: string): boolean {
  if (pendingStarts.has(accountId)) return false;
  pendingStarts.add(accountId);
  return true;
}

export function clearPending(accountId: string): void {
  pendingStarts.delete(accountId);
}

/**
 * Wait until another in-flight start for this account finishes.
 * A start request can take up to ~60s (Chromium launch + page load), so
 * poll until the other caller's finally-block clears the pending flag.
 */
export async function waitForPendingToClear(
  accountId: string,
  timeoutMs = 70_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (pendingStarts.has(accountId)) {
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 200));
  }
  return true;
}

/**
 * A session created moments ago for this account, if any.
 * Used to coalesce duplicate starts (React StrictMode double-mount,
 * double-clicks) into the same browser session instead of erroring 409.
 * Carries the original start meta (headed/qrImage) so coalesced callers
 * see the same runtime shape as the first caller.
 */
export function getFreshSession(
  accountId: string,
  maxAgeMs: number
): { sessionId: string; headed?: boolean; qrImage?: string } | null {
  const session = sessions.get(accountId);
  if (!session) return null;
  if (Date.now() - session.startedAt.getTime() > maxAgeMs) return null;
  return { sessionId: session.sessionId, ...session.meta };
}
