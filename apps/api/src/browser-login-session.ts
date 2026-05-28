interface LoginSession {
  sessionId: string;
  accountId: string;
  startedAt: Date;
}

const sessions = new Map<string, LoginSession>();

export function setSession(accountId: string, sessionId: string): void {
  sessions.set(accountId, { sessionId, accountId, startedAt: new Date() });
}

export function getSessionId(accountId: string): string | null {
  return sessions.get(accountId)?.sessionId ?? null;
}

export function clearSession(accountId: string): void {
  sessions.delete(accountId);
}
