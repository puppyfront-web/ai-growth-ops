import { createReadStream, existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

const sourceArgument = process.argv.find(
  (value) =>
    !value.startsWith('--') &&
    value !== process.argv[0] &&
    value !== process.argv[1]
);
if (!sourceArgument || !process.argv.includes('--confirm')) {
  throw new Error('Usage: pnpm local:restore -- <backup-directory> --confirm');
}

const root = resolve(process.env.LOCAL_DATA_DIR?.trim() || '.local-data');
const source = resolve(sourceArgument);
const databaseBackup = resolve(source, 'database.sql.gz');
const filesBackup = resolve(source, 'files.tar.gz');
const manifestPath = resolve(source, 'manifest.json');

if (!existsSync(databaseBackup) || !existsSync(manifestPath)) {
  throw new Error('Backup is missing database.sql.gz or manifest.json');
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.formatVersion !== 1) throw new Error('Unsupported backup format');

const composeArgs = ['compose', '-f', 'docker-compose.prod.yml'];
function compose(args) {
  const result = spawnSync('docker', [...composeArgs, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  });
  if (result.status !== 0)
    throw new Error(`docker compose ${args.join(' ')} failed`);
}

async function restoreDatabase() {
  const child = spawn(
    'docker',
    [
      ...composeArgs,
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"'
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'inherit', 'inherit']
    }
  );
  const closed = new Promise((done) => child.once('close', done));
  await pipeline(createReadStream(databaseBackup), createGunzip(), child.stdin);
  const code = await closed;
  if (code !== 0) throw new Error('PostgreSQL restore failed');
}

compose(['down']);
if (existsSync(filesBackup)) {
  for (const directory of ['objects', 'secrets', 'uploads']) {
    rmSync(resolve(root, directory), { recursive: true, force: true });
  }
  const archive = spawnSync('tar', ['-xzf', filesBackup, '-C', root], {
    stdio: 'inherit'
  });
  if (archive.status !== 0) throw new Error('Local file restore failed');
}

compose(['up', '-d', '--wait', 'postgres']);
compose([
  'exec',
  '-T',
  'postgres',
  'sh',
  '-c',
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
]);
await restoreDatabase();
compose(['up', '-d']);
console.log(`Backup restored from: ${source}`);
