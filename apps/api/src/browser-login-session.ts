interface LoginSession {
  sessionId: string;
  accountId: string;
  startedAt: Date;
}

const sessions = new Map<string, LoginSession>();
const pendingStarts = new Set<string>();

export function setSession(accountId: string, sessionId: string): void {
  sessions.set(accountId, { sessionId, accountId, startedAt: new Date() });
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
 */
export function getFreshSession(
  accountId: string,
  maxAgeMs: number
): { sessionId: string } | null {
  const session = sessions.get(accountId);
  if (!session) return null;
  if (Date.now() - session.startedAt.getTime() > maxAgeMs) return null;
  return { sessionId: session.sessionId };
}
