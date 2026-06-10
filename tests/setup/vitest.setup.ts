import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load .env from project root so integration tests can access DATABASE_URL etc.
config({ path: resolve(import.meta.dirname, '../../.env') });
