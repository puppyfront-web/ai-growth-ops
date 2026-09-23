import type { IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

export function isInternalApiAuthorized(req: IncomingMessage): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  const supplied = req.headers['x-internal-api-key'];
  if (!secret || typeof supplied !== 'string') return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
