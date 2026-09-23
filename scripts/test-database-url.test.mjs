import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testDatabaseUrl, testRedisUrl } from './test-environment.mjs';

test('changes only the exact application database name', () => {
  assert.equal(
    testDatabaseUrl('postgresql://user:secret@localhost:5432/ai_growth_ops?schema=public'),
    'postgresql://user:secret@localhost:5432/ai_growth_ops_e2e?schema=public'
  );
  assert.equal(testDatabaseUrl('postgres://localhost/ai_growth_ops_e2e'), 'postgres://localhost/ai_growth_ops_e2e');
});

test('rejects lookalike names and occurrences outside the database path', () => {
  for (const url of [
    '', 'not-a-url',
    'postgres://ai_growth_ops_e2e:secret@localhost/production',
    'postgres://localhost/production?schema=ai_growth_ops_e2e',
    'postgres://localhost/ai_growth_ops_e2e_backup',
    'postgres://localhost/ai_growth_ops_e2e-production',
    'postgres://localhost/%61i_growth_ops_e2e',
    'https://localhost/ai_growth_ops_e2e'
  ]) {
    assert.throws(() => testDatabaseUrl(url), /disposable test database/);
  }
});

test('invalid input never exposes credentials in errors', () => {
  assert.throws(() => testDatabaseUrl('postgres://user:private-key@localhost/production'),
    (error) => !error.message.includes('private-key'));
});

test('isolates Redis jobs while preserving connection settings', () => {
  assert.equal(testRedisUrl('redis://user:secret@localhost:6379/0'), 'redis://user:secret@localhost:6379/15');
  assert.equal(testRedisUrl(), 'redis://127.0.0.1:6379/15');
});
