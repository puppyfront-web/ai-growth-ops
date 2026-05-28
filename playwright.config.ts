import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'pnpm tsx apps/api/src/server.ts',
      url: 'http://127.0.0.1:3100/health',
      reuseExistingServer: true,
      timeout: 15_000,
      env: { API_PORT: '3100' }
    },
    {
      command: 'cd apps/web && pnpm dev',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: true,
      timeout: 30_000
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
