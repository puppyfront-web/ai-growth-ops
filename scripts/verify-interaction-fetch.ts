/**
 * 验证脚本：评论 / 私信抓取链路。
 *
 * 覆盖：
 *   1. browser-runner /assist/fetch-comments、/assist/fetch-messages 的参数校验
 *   2. Sandbox 连接器（无外部依赖）评论/私信拉取
 *   3. 端到端：模拟 worker handler 把沙箱评论/私信落库 + 去重
 *   4. 现有数据库账号摘要
 */

import { createDatabaseClient } from '../packages/database/src/index.js';
import { getOrCreateConnector } from '../packages/connectors/src/interaction/registry.js';
import { handleInteractionSyncComments } from '../apps/worker/src/job-handlers/interaction.sync-comments.js';
import { handleInteractionSyncMessages } from '../apps/worker/src/job-handlers/interaction.sync-messages.js';

interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: CheckResult[] = [];

function record(name: string, passed: boolean, detail?: string): void {
  results.push({ name, passed, detail });
  console.log(`${passed ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

async function checkAssistRoute(
  runnerUrl: string,
  endpoint: string,
  body: Record<string, unknown>,
  expected: { status: number; bodyShape: 'array' | 'error' },
): Promise<void> {
  const resp = await fetch(`${runnerUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await resp.json()) as unknown;
  const ok =
    resp.status === expected.status &&
    (expected.bodyShape === 'array' ? Array.isArray(json) : typeof json === 'object' && json !== null && 'error' in (json as object));
  record(
    `${endpoint} ${JSON.stringify(body)}`,
    ok,
    `status=${resp.status} body=${JSON.stringify(json).slice(0, 80)}`,
  );
}

function makeFakeJob<T>(data: T) {
  return {
    data,
    log: (_msg: string) => Promise.resolve(),
    updateProgress: (_p: number) => Promise.resolve(),
  } as unknown as import('bullmq').Job<T>;
}

async function main() {
  const db = createDatabaseClient();
  const runnerUrl = process.env.BROWSER_RUNNER_URL || 'http://localhost:3200';

  // ── 1. 现状摘要 ────────────────────────────────────────────────
  console.log('\n[1] 数据库账号现状');
  const accounts = await db.platformAccount.findMany({
    select: {
      id: true,
      platform: true,
      mode: true,
      name: true,
      status: true,
      cookieRef: true,
      accessTokenEncrypted: true,
    },
  });
  console.table(
    accounts.map((a) => ({
      platform: a.platform,
      name: a.name,
      mode: a.mode,
      status: a.status,
      hasCookie: !!a.cookieRef,
      hasAccessToken: !!a.accessTokenEncrypted,
    })),
  );

  // ── 2. browser-runner 参数校验 ────────────────────────────────
  console.log('\n[2] browser-runner /assist 路由参数校验');
  await checkAssistRoute(
    runnerUrl,
    '/assist/fetch-comments',
    {},
    { status: 400, bodyShape: 'error' },
  );
  await checkAssistRoute(
    runnerUrl,
    '/assist/fetch-comments',
    { platform: 'douyin' },
    { status: 400, bodyShape: 'error' },
  );
  await checkAssistRoute(
    runnerUrl,
    '/assist/fetch-comments',
    { platform: 'unknown_platform', cookie: 'x=1' },
    { status: 400, bodyShape: 'error' },
  );
  await checkAssistRoute(
    runnerUrl,
    '/assist/fetch-messages',
    {},
    { status: 400, bodyShape: 'error' },
  );
  // 不支持私信的平台应返回空数组（200）
  await checkAssistRoute(
    runnerUrl,
    '/assist/fetch-messages',
    { platform: 'wechat_official', cookie: 'x=1' },
    { status: 200, bodyShape: 'array' },
  );

  // ── 3. Sandbox 连接器直连测试 ─────────────────────────────────
  console.log('\n[3] Sandbox 连接器直连');
  const sandbox = getOrCreateConnector('douyin', 'sandbox', { mode: 'sandbox' });
  const sbComments = await sandbox.fetchComments({
    platformAccountId: 'sandbox',
    sourceContentId: 'verify-content',
    limit: 5,
  });
  record(
    'sandbox.fetchComments 返回 5 条评论',
    sbComments.length === 5 &&
      sbComments.every((c) => c.externalCommentId && c.content && c.userNickname),
    `示例：${sbComments[0]?.userNickname}: ${sbComments[0]?.content}`,
  );
  const sbMessages = await sandbox.fetchMessages({
    platformAccountId: 'sandbox',
    limit: 4,
  });
  record(
    'sandbox.fetchMessages 返回 4 条私信',
    sbMessages.length === 4 &&
      sbMessages.every((m) => m.externalMessageId && m.content && m.userNickname),
    `示例：${sbMessages[0]?.userNickname}: ${sbMessages[0]?.content}`,
  );

  // ── 4. 端到端：模拟 worker handler 把沙箱数据落库 ───────────────
  console.log('\n[4] 端到端：worker handler 把 sandbox 数据落库（含去重）');
  const adminUser = await db.user.findFirstOrThrow({ where: { role: 'admin' } });

  const testAccount = await db.platformAccount.create({
    data: {
      userId: adminUser.id,
      platform: 'douyin',
      name: '__verify_sandbox_account__',
      mode: 'manual_import',
      status: 'active',
      authType: 'none',
    },
  });
  console.log(`  test account: ${testAccount.id}`);

  const syncJobComments = await db.interactionSyncJob.create({
    data: {
      platform: 'douyin',
      platformAccountId: testAccount.id,
      syncType: 'comments',
      mode: 'sandbox',
      status: 'queued',
    },
  });
  await handleInteractionSyncComments(
    makeFakeJob({
      userId: adminUser.id,
      platformAccountId: testAccount.id,
      platform: 'douyin',
      mode: 'sandbox',
      sourceContentId: 'verify-content',
      limit: 6,
      syncJobId: syncJobComments.id,
    }),
  );
  const after1 = await db.interactionSyncJob.findUniqueOrThrow({ where: { id: syncJobComments.id } });
  const dbComments1 = await db.interaction.count({
    where: { platformAccountId: testAccount.id, type: 'comment' },
  });
  record(
    'syncComments handler 执行后 sync job=completed',
    after1.status === 'completed' && after1.fetchedCount === 6,
    `status=${after1.status} fetchedCount=${after1.fetchedCount}`,
  );
  record(
    '评论已写入数据库',
    dbComments1 === 6,
    `interaction(comment) count=${dbComments1}`,
  );

  // 第二次执行 → 由于沙箱每次返回随机 externalCommentId，去重不会命中（设计如此）
  // 这里改成验证：相同 externalCommentId 不会重复插入
  const dup = await db.interaction.findFirst({
    where: { platformAccountId: testAccount.id, type: 'comment' },
  });
  if (dup) {
    let conflictHit = false;
    try {
      await db.interaction.create({
        data: {
          userId: adminUser.id,
          externalInteractionId: dup.externalInteractionId,
          platformAccountId: testAccount.id,
          platform: 'douyin',
          type: 'comment',
          status: 'NEW',
          content: '冲突测试',
        },
      });
    } catch {
      conflictHit = true;
    }
    record(
      '相同 externalInteractionId 唯一约束生效（防重复）',
      conflictHit,
      `existing externalInteractionId=${dup.externalInteractionId.slice(0, 30)}...`,
    );
  }

  // 私信
  const syncJobMsgs = await db.interactionSyncJob.create({
    data: {
      platform: 'douyin',
      platformAccountId: testAccount.id,
      syncType: 'messages',
      mode: 'sandbox',
      status: 'queued',
    },
  });
  await handleInteractionSyncMessages(
    makeFakeJob({
      userId: adminUser.id,
      platformAccountId: testAccount.id,
      platform: 'douyin',
      mode: 'sandbox',
      limit: 4,
      syncJobId: syncJobMsgs.id,
    }),
  );
  const after2 = await db.interactionSyncJob.findUniqueOrThrow({ where: { id: syncJobMsgs.id } });
  const dbMessages = await db.interaction.count({
    where: { platformAccountId: testAccount.id, type: 'message' },
  });
  record(
    'syncMessages handler 执行后 sync job=completed',
    after2.status === 'completed' && after2.fetchedCount === 4,
    `status=${after2.status} fetchedCount=${after2.fetchedCount}`,
  );
  record(
    '私信已写入数据库',
    dbMessages === 4,
    `interaction(message) count=${dbMessages}`,
  );

  // ── 5. 清理 ───────────────────────────────────────────────────
  await db.interaction.deleteMany({ where: { platformAccountId: testAccount.id } });
  await db.interactionSyncJob.deleteMany({ where: { platformAccountId: testAccount.id } });
  await db.platformAccount.delete({ where: { id: testAccount.id } });
  console.log('\n[5] 测试数据已清理');

  // ── 汇总 ──────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.passed);
  console.log(`\n汇总：${results.length - failed.length}/${results.length} 通过`);
  if (failed.length > 0) {
    console.log('失败项：');
    failed.forEach((r) => console.log(`  ✗ ${r.name}: ${r.detail ?? ''}`));
  }

  await db.$disconnect();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
