import { afterEach, describe, expect, it, vi } from 'vitest';

async function startTestServer() {
  const { createBrowserRunnerServer } =
    await import('../../../apps/browser-runner/src/server');
  const server = createBrowserRunnerServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind test server');
  }
  return {
    server,
    url: `http://127.0.0.1:${address.port}`
  };
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('/assist/fetch-messages', () => {
  it('returns a structured 502 error when message collection fails', async () => {
    vi.doMock('../../../apps/browser-runner/src/browser-session.js', () => ({
      createStealthSession: vi
        .fn()
        .mockRejectedValue(new Error('session bootstrap failed'))
    }));

    const { server, url } = await startTestServer();

    try {
      const response = await fetch(`${url}/assist/fetch-messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platform: 'douyin',
          cookie: 'sessionid=test'
        })
      });

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({
        error: 'Failed to fetch messages',
        errorCode: 'ASSIST_FETCH_MESSAGES_FAILED',
        details: 'session bootstrap failed'
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});
