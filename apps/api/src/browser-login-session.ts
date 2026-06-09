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
