export type BrowserRunnerEnvironment = Partial<
  Pick<
    NodeJS.ProcessEnv,
  'BROWSER_RUNNER_URL' | 'BROWSER_RUNNER_SECRET' | 'TOKEN_ENCRYPTION_KEY'
  >
>;

export function getBrowserRunnerConfig(
  environment: BrowserRunnerEnvironment = process.env
): { url: string; secret: string } {
  return {
    url: (environment.BROWSER_RUNNER_URL || 'http://localhost:3200').replace(/\/$/, ''),
    secret:
      environment.BROWSER_RUNNER_SECRET?.trim() ||
      environment.TOKEN_ENCRYPTION_KEY?.trim() ||
      ''
  };
}

export function getBrowserRunnerHeaders(
  extra: Record<string, string> = {},
  environment: BrowserRunnerEnvironment = process.env
): Record<string, string> {
  const { secret } = getBrowserRunnerConfig(environment);
  return {
    ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    ...extra
  };
}
