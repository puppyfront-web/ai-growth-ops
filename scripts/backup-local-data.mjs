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

const root = resolve(process.env.LOCAL_DATA_DIR?.trim() || '.local-data');
const stamp = new Date()
  .toISOString()
  .replaceAll(':', '-')
  .replaceAll('.', '-');
const destination = resolve(root, 'backups', stamp);
const composeArgs = ['compose', '-f', 'docker-compose.prod.yml'];

if (!existsSync(root)) {
  throw new Error(`Local data directory does not exist: ${root}`);
}

mkdirSync(destination, { recursive: true, mode: 0o700 });

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

async function dumpDatabase() {
  const child = spawn(
    'docker',
    [
      ...composeArgs,
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"'
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'inherit']
    }
  );
  const closed = new Promise((done) => child.once('close', done));
  await pipeline(
    child.stdout,
    createGzip(),
    createWriteStream(resolve(destination, 'database.sql.gz'), { mode: 0o600 })
  );
  const code = await closed;
  if (code !== 0) throw new Error('PostgreSQL backup failed');
}

compose(['stop', 'api', 'worker', 'web', 'browser-runner']);
try {
  await dumpDatabase();
  compose(['stop', 'minio']);
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
  writeFileSync(
    resolve(destination, 'manifest.json'),
    `${JSON.stringify({ createdAt: new Date().toISOString(), formatVersion: 1, includes: ['database', ...paths] }, null, 2)}\n`,
    { mode: 0o600 }
  );
  console.log(`Backup created: ${destination}`);
} finally {
  compose(['up', '-d']);
}
