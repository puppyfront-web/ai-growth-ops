export function testDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('A disposable test database URL is required');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['/ai_growth_ops', '/ai_growth_ops_e2e'].includes(url.pathname)) {
    throw new Error('Refusing to run outside the disposable test database');
  }
  url.pathname = '/ai_growth_ops_e2e';
  return url.toString();
}

export function testRedisUrl(value = 'redis://127.0.0.1:6379') {
  const url = new URL(value);
  url.pathname = '/15';
  return url.toString();
}
