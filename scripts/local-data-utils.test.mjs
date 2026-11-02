import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  matchPostgresContainer,
  parseDatabaseUrl
} from './local-data-utils.mjs';

test('parseDatabaseUrl 解析完整连接串', () => {
  assert.deepEqual(
    parseDatabaseUrl('postgresql://postgres:postgres@localhost:5432/ai_growth_ops'),
    {
      user: 'postgres',
      password: 'postgres',
      host: 'localhost',
      port: 5432,
      db: 'ai_growth_ops'
    }
  );
});

test('parseDatabaseUrl 支持无密码与自定义端口', () => {
  assert.deepEqual(parseDatabaseUrl('postgresql://u@127.0.0.1:5433/app'), {
    user: 'u',
    password: '',
    host: '127.0.0.1',
    port: 5433,
    db: 'app'
  });
});

test('parseDatabaseUrl 拒绝非 postgres 协议、缺库名与畸形输入', () => {
  assert.equal(parseDatabaseUrl('mysql://u:p@localhost:3306/app'), null);
  assert.equal(parseDatabaseUrl('postgresql://u:p@localhost:5432'), null);
  assert.equal(parseDatabaseUrl('not a url'), null);
  assert.equal(parseDatabaseUrl(undefined), null);
});

test('matchPostgresContainer 按端口命中 postgres 容器（IPv4 与 IPv6 映射）', () => {
  const ps = [
    'ai-growth-ops-postgres\tpostgres:16-alpine\t0.0.0.0:5432->5432/tcp, :::5432->5432/tcp',
    'formula-physics-postgres\tpostgres:16\t0.0.0.0:54333->5432/tcp'
  ];
  assert.equal(matchPostgresContainer(ps, 5432), 'ai-growth-ops-postgres');
  assert.equal(matchPostgresContainer(ps, 54333), 'formula-physics-postgres');
});

test('matchPostgresContainer 忽略非 postgres 镜像与未发布端口', () => {
  const ps = [
    'fake-web\tnginx\t0.0.0.0:5432->80/tcp',
    'redis-box\tredis:7\t6379->6379/tcp',
    'stopped-db\tpostgres:16\t'
  ];
  assert.equal(matchPostgresContainer(ps, 5432), null);
  assert.equal(matchPostgresContainer(ps, 6379), null);
});
