interface CaptchaSolveSession {
  sessionId: string;
  platformAccountId: string;
  startedAt: Date;
}

const sessions = new Map<string, CaptchaSolveSession>();

export function setCaptchaSolveSession(
  organizationId: string,
  platformAccountId: string,
  sessionId: string
): void {
  sessions.set(organizationId, {
    sessionId,
    platformAccountId,
    startedAt: new Date()
  });
}

export function getCaptchaSolveSession(organizationId: string) {
  return sessions.get(organizationId) ?? null;
}

export function clearCaptchaSolveSession(organizationId: string): void {
  sessions.delete(organizationId);
}
