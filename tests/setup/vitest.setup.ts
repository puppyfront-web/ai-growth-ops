import { config } from 'dotenv';
import { resolve } from 'node:path';
import { testDatabaseUrl, testRedisUrl } from '../../scripts/test-environment.mjs';

config({ path: resolve(import.meta.dirname, '../../.env') });
process.env.DATABASE_URL = testDatabaseUrl(process.env.DATABASE_URL);
process.env.REDIS_URL = testRedisUrl(process.env.REDIS_URL);
