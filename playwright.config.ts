import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

import { testDatabaseUrl, testRedisUrl } from './scripts/test-environment.mjs';

const e2eDatabaseUrl = testDatabaseUrl(process.env.DATABASE_URL);
process.env.DATABASE_URL = e2eDatabaseUrl;
process.env.REDIS_URL = testRedisUrl(process.env.REDIS_URL);

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
        REDIS_URL: process.env.REDIS_URL,
        DATABASE_URL: e2eDatabaseUrl,
        LOCAL_DATA_DIR: 'test-results/local-data',
        // 全量套件共享本 API 实例且每个用例都登录一次，默认 10 次/分钟会触发限流
        LOGIN_RATE_LIMIT: '1000'
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
