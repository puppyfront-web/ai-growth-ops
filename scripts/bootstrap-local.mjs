import {
  copyFileSync,
  existsSync,
  readFileSync
} from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolvePostgresAccess } from './local-data-utils.mjs';

/**
 * 一键本地引导：环境检查 → .env → 基础设施容器 → 依赖 → 数据库迁移 →
 * 种子管理员 → 输出访问地址与安全清单。全程幂等，可重复执行。
 *
 * 用法：corepack pnpm local:bootstrap
 */

const root = process.cwd();
const step = (title) => console.log(`\n▶ ${title}`);
const ok = (message) => console.log(`  ✓ ${message}`);
const fail = (message) => {
  console.error(`  ✗ ${message}`);
  process.exit(1);
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    ...options
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} 失败（退出码 ${result.status}）`);
  }
  return result;
}

/** 进程启动晚于 .env 创建时，手动补载缺失的环境变量（不覆盖已有值）。 */
function loadMissingEnv(file) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
}

step('环境检查');
const nodeMajor = Number(process.versions.node.split('.')[0]);
const nodeMinor = Number(process.versions.node.split('.')[1]);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 12)) {
  fail(`Node.js 需要 >= 22.12，当前 ${process.versions.node}`);
}
ok(`Node ${process.versions.node}`);
const dockerInfo = spawnSync('docker', ['info'], { encoding: 'utf8' });
if (dockerInfo.status !== 0) {
  fail('Docker 不可用：请先启动 Docker Desktop');
}
ok('Docker 运行中');

step('环境变量');
const envPath = resolve(root, '.env');
if (!existsSync(envPath)) {
  copyFileSync(resolve(root, '.env.example'), envPath);
  loadMissingEnv(envPath);
  ok('已从 .env.example 创建 .env（本地默认值可直接跑通）');
} else {
  loadMissingEnv(envPath);
  ok('.env 已存在，保持不变');
}

step('基础设施容器（PostgreSQL / Redis / MinIO）');
run('docker', ['compose', 'up', '-d']);
const access = resolvePostgresAccess({ env: process.env });
ok(`数据库通道：${access.mode === 'compose' ? 'compose' : `容器 ${access.container}`}`);

const psqlArgs =
  access.mode === 'compose'
    ? ['compose', '-f', access.composeFile, 'exec', '-T', 'postgres']
    : ['exec', access.container];
let ready = false;
for (let attempt = 1; attempt <= 30 && !ready; attempt += 1) {
  const probe = spawnSync(
    'docker',
    [
      ...psqlArgs,
      'pg_isready',
      '-U',
      access.mode === 'compose'
        ? process.env.POSTGRES_USER || 'postgres'
        : access.user,
      '-d',
      access.mode === 'compose'
        ? process.env.POSTGRES_DB || 'ai_growth_ops'
        : access.db
    ],
    { encoding: 'utf8' }
  );
  if (probe.status === 0) ready = true;
  else spawnSync('sleep', ['2']);
}
if (!ready) fail('PostgreSQL 60 秒内未就绪，请检查 docker compose logs postgres');
ok('PostgreSQL 已就绪');

step('依赖与数据库结构');
if (!existsSync(resolve(root, 'node_modules'))) {
  run('corepack', ['pnpm', 'install']);
  ok('依赖安装完成');
} else {
  ok('依赖已存在，跳过安装');
}
run('corepack', ['pnpm', 'db:generate']);
run('corepack', ['pnpm', 'db:deploy']);
ok('数据库迁移已应用');

step('种子账号');
const userCount = spawnSync(
  'docker',
  [
    ...psqlArgs,
    'psql',
    '-U',
    access.mode === 'compose'
      ? process.env.POSTGRES_USER || 'postgres'
      : access.user,
    '-d',
    access.mode === 'compose'
      ? process.env.POSTGRES_DB || 'ai_growth_ops'
      : access.db,
    '-t',
    '-A',
    '-c',
    'select count(*) from "User"'
  ],
  { encoding: 'utf8' }
);
if (userCount.status === 0 && Number(userCount.stdout.trim()) > 0) {
  ok('已有管理员账号，跳过种子');
} else {
  run('corepack', ['pnpm', 'db:seed']);
  ok('已创建初始管理员');
}

console.log(`
════════════════════════════════════════════════════════════
引导完成。启动服务：

  corepack pnpm dev                        # API（:${process.env.API_PORT || 3100}）
  corepack pnpm --filter @ai-growth-ops/worker dev   # Worker（队列）
  corepack pnpm dev:browser-runner         # 浏览器自动化（:3200，采集/发布需要）
  corepack pnpm dev:web                    # Web（:${process.env.WEB_PORT || 3001}）

初始管理员：${process.env.ADMIN_EMAIL || 'admin@ai-growth-ops.local'}
密码：${process.env.ADMIN_PASSWORD ? '（已按 .env 中 ADMIN_PASSWORD 创建）' : 'changeme123（开发默认，登录后立即修改）'}

上线/对外暴露前必做：
  1. 替换 .env 中所有 CHANGE_ME 密钥（AUTH_SECRET / TOKEN_ENCRYPTION_KEY / INTERNAL_API_SECRET）
  2. 修改默认管理员密码；生产环境用 ADMIN_PASSWORD 显式设置强密码后再 seed
  3. 配置 LLM（集成 → LLM）后才能使用需求分析与语义打分
  4. 建立备份习惯：corepack pnpm local:backup（Runbook 见 docs/delivery/2026-11-02-backup-restore-drill.md）
════════════════════════════════════════════════════════════
`);
