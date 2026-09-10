import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

const e2eDatabaseUrl = (process.env.DATABASE_URL ?? '').replace(
  /\/ai_growth_ops(?!_e2e)\b/,
  '/ai_growth_ops_e2e'
);
if (!e2eDatabaseUrl.includes('ai_growth_ops_e2e')) {
  throw new Error('Playwright must target ai_growth_ops_e2e, not the app database');
}
process.env.DATABASE_URL = e2eDatabaseUrl;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3301',
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'pnpm tsx apps/api/src/server.ts',
      url: 'http://127.0.0.1:3310/health',
      reuseExistingServer: false,
      timeout: 15_000,
      env: {
        ...process.env,
        API_PORT: '3310',
        REDIS_URL: 'redis://127.0.0.1:6379/15',
        DATABASE_URL: e2eDatabaseUrl
      }
    },
    {
      command: 'cd apps/web && pnpm exec next dev --port 3301',
      url: 'http://127.0.0.1:3301',
      reuseExistingServer: false,
      env: {
        API_BASE_URL: 'http://127.0.0.1:3310',
        NEXT_DIST_DIR: '.next-e2e-v2'
      },
      timeout: 120_000
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
