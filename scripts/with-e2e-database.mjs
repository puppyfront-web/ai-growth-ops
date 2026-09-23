#!/usr/bin/env node
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { testDatabaseUrl, testRedisUrl } from './test-environment.mjs';

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('usage: node scripts/with-e2e-database.mjs <command> [args...]');
  process.exit(1);
}
const result = spawnSync(cmd, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl(process.env.DATABASE_URL),
    REDIS_URL: testRedisUrl(process.env.REDIS_URL)
  }
});
process.exit(result.status ?? 1);
