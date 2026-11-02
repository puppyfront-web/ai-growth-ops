import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { parse, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const BACKUP_DIRECTORIES = new Set(['objects', 'secrets', 'uploads']);

export function resolveLocalDataRoot(value, cwd = process.cwd()) {
  const root = resolve(cwd, value?.trim() || '.local-data');
  if (root === parse(root).root) {
    throw new Error('LOCAL_DATA_DIR must not be the filesystem root');
  }
  return root;
}

export function assertSafeArchiveEntries(entries) {
  for (const original of entries) {
    const entry = original.replace(/^\.\//, '').replace(/\/$/, '');
    const segments = entry.split('/');
    if (
      !entry ||
      original.startsWith('/') ||
      original.includes('\\') ||
      segments.includes('..') ||
      !BACKUP_DIRECTORIES.has(segments[0])
    ) {
      throw new Error(`Unsafe backup archive entry: ${original}`);
    }
  }
}

export function assertSafeArchiveEntryTypes(entries) {
  for (const entry of entries) {
    if (entry && entry[0] !== '-' && entry[0] !== 'd') {
      throw new Error(`Unsupported backup archive entry type: ${entry[0]}`);
    }
  }
}

export async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

/**
 * 解析 postgres:// 连接串；非 postgres 协议或缺库名返回 null。
 */
export function parseDatabaseUrl(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    return null;
  }
  const db = url.pathname.replace(/^\//, '');
  if (!db) return null;
  return {
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    host: url.hostname,
    port: Number(url.port || 5432),
    db
  };
}

/**
 * 从 `docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}'` 的输出行里，
 * 找到把目标宿主端口发布出去的 postgres 容器名；找不到返回 null。
 * 纯函数，便于单测（IPv4 `0.0.0.0:5432->` 与 IPv6 `:::5432->` 两种映射都认）。
 */
export function matchPostgresContainer(psLines, port) {
  const publishPattern = new RegExp(`[:*]${port}->`);
  for (const line of psLines) {
    const [name, image, ports] = line.split('\t');
    if (!name || !image || !ports) continue;
    if (!image.startsWith('postgres')) continue;
    if (publishPattern.test(ports)) return name;
  }
  return null;
}

/**
 * 决定 pg_dump/psql 的执行通道，兼容两种部署布局：
 * 1) compose 模式：docker-compose.prod.yml 里有运行中的 postgres（生产行为，保持不变）；
 * 2) container 模式：开发/自托管布局——按 DATABASE_URL 的端口在 `docker ps` 里
 *    定位承载它的 postgres 容器，直接 docker exec。
 */
export function resolvePostgresAccess({
  env,
  composeFile = 'docker-compose.prod.yml',
  runDocker = (args, options) =>
    spawnSync('docker', args, { cwd: process.cwd(), env: process.env, ...options })
}) {
  const probe = runDocker(
    ['compose', '-f', composeFile, 'ps', '--services', '--status', 'running'],
    { encoding: 'utf8' }
  );
  if (probe.status === 0) {
    const services = probe.stdout.split('\n').filter(Boolean);
    if (services.includes('postgres')) {
      return { mode: 'compose', composeFile };
    }
  }

  const db = parseDatabaseUrl(env.DATABASE_URL);
  if (!db || !['localhost', '127.0.0.1', '::1'].includes(db.host)) {
    throw new Error(
      '未找到可用的 postgres：prod compose 无运行实例，且 DATABASE_URL 未指向本机（localhost）数据库'
    );
  }
  const ps = runDocker(
    ['ps', '--format', '{{.Names}}\t{{.Image}}\t{{.Ports}}'],
    { encoding: 'utf8' }
  );
  if (ps.status !== 0) {
    throw new Error('docker ps 不可用，请确认 Docker 正在运行');
  }
  const container = matchPostgresContainer(
    ps.stdout.split('\n').filter(Boolean),
    db.port
  );
  if (!container) {
    throw new Error(
      `未找到发布本机 ${db.port} 端口的 postgres 容器（DATABASE_URL=${env.DATABASE_URL}）`
    );
  }
  return {
    mode: 'container',
    container,
    user: db.user || 'postgres',
    db: db.db
  };
}
