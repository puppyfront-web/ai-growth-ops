import {
  createWriteStream,
  existsSync,
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawn, spawnSync } from 'node:child_process';
import { createGzip } from 'node:zlib';
import {
  resolvePostgresAccess,
  resolveLocalDataRoot,
  sha256File
} from './local-data-utils.mjs';

const root = resolveLocalDataRoot(process.env.LOCAL_DATA_DIR);
const stamp = new Date()
  .toISOString()
  .replaceAll(':', '-')
  .replaceAll('.', '-');
const destination = resolve(root, 'backups', stamp);

// 备份输出需要一个家：数据目录不存在时自动创建（空目录仅意味着没有文件类数据可打包）
mkdirSync(root, { recursive: true, mode: 0o700 });

mkdirSync(destination, { recursive: true, mode: 0o700 });

const access = resolvePostgresAccess({ env: process.env });
const composeArgs =
  access.mode === 'compose'
    ? ['compose', '-f', access.composeFile]
    : null;

function compose(args, options = {}) {
  const result = spawnSync('docker', [...composeArgs, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    ...options
  });
  if (result.status !== 0)
    throw new Error(`docker compose ${args.join(' ')} failed`);
}

// pg_dump 本身具备事务一致性；container 模式（开发/自托管布局）下
// 应用进程无需停机。compose（生产）模式保持原有的停写服务语义。
function dumpCommandArgs() {
  if (access.mode === 'compose') {
    return [
      ...composeArgs,
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"'
    ];
  }
  return ['exec', access.container, 'pg_dump', '-U', access.user, access.db];
}

async function dumpDatabase() {
  const child = spawn('docker', dumpCommandArgs(), {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'inherit']
  });
  const closed = new Promise((done) => child.once('close', done));
  await pipeline(
    child.stdout,
    createGzip(),
    createWriteStream(resolve(destination, 'database.sql.gz'), { mode: 0o600 })
  );
  const code = await closed;
  if (code !== 0) throw new Error('PostgreSQL backup failed');
}

const running =
  access.mode === 'compose'
    ? new Set(
        (
          spawnSync(
            'docker',
            [...composeArgs, 'ps', '--services', '--status', 'running'],
            { cwd: process.cwd(), env: process.env, encoding: 'utf8' }
          ).stdout ?? ''
        )
          .split('\n')
          .filter(Boolean)
      )
    : new Set();
const writeServices = ['api', 'worker', 'web', 'browser-runner'].filter(
  (name) => running.has(name)
);
if (writeServices.length > 0) compose(['stop', ...writeServices]);
try {
  await dumpDatabase();
  if (running.has('minio')) compose(['stop', 'minio']);
  const paths = ['objects', 'secrets', 'uploads'].filter((name) =>
    existsSync(resolve(root, name))
  );
  if (paths.length > 0) {
    const archive = spawnSync(
      'tar',
      ['-czf', resolve(destination, 'files.tar.gz'), '-C', root, ...paths],
      { stdio: 'inherit' }
    );
    if (archive.status !== 0) throw new Error('Local file backup failed');
  }
  const checksums = {
    'database.sql.gz': await sha256File(
      resolve(destination, 'database.sql.gz')
    ),
    ...(paths.length > 0
      ? {
          'files.tar.gz': await sha256File(resolve(destination, 'files.tar.gz'))
        }
      : {})
  };
  writeFileSync(
    resolve(destination, 'manifest.json'),
    `${JSON.stringify({ createdAt: new Date().toISOString(), formatVersion: 2, includes: ['database', ...paths], checksums }, null, 2)}\n`,
    { mode: 0o600 }
  );
  console.log(`Backup created: ${destination}`);
} finally {
  const stopped = [
    ...writeServices,
    ...(running.has('minio') ? ['minio'] : [])
  ];
  if (stopped.length > 0) compose(['up', '-d', ...stopped]);
}
