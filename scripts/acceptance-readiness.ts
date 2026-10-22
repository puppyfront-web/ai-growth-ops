import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabaseClient } from '@ai-growth-ops/database';

/**
 * Read-only readiness check for the real-platform acceptance runbook
 * (docs/delivery/real-platform-acceptance-runbook.md). Never writes, never
 * contacts external platforms — it only reports which preconditions hold so
 * the executor knows the approval form is the only missing piece.
 */

const EVIDENCE_DIR = join(
  process.cwd(),
  'docs/delivery/acceptance-evidence'
);

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

function daysAgo(date: Date | null | undefined): string {
  if (!date) return '从未';
  const hours = (Date.now() - date.getTime()) / 3_600_000;
  if (hours < 24) return `${Math.round(hours)} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

async function main() {
  const db = createDatabaseClient();
  const checks: Check[] = [];

  try {
    // 1. Database reachable
    const [organizations, members] = await Promise.all([
      db.organization.count(),
      db.organizationMember.count({ where: { status: 'active' } })
    ]);
    checks.push({
      name: '数据库连接',
      ok: true,
      detail: `${organizations} 个组织 / ${members} 个活跃成员`
    });

    // 2. Douyin browser-assist account (Runbook 3.1)
    const douyinAccounts = await db.platformAccount.findMany({
      where: {
        platform: 'douyin',
        mode: 'browser_assist',
        deletedAt: null,
        cookieRef: { not: '' }
      },
      select: {
        name: true,
        status: true,
        lastHealthCheckAt: true,
        expiresAt: true
      }
    });
    const douyinActive = douyinAccounts.filter((a) => a.status === 'active');
    checks.push({
      name: '抖音扫码账号（Runbook 3.1 回复验收）',
      ok: douyinActive.length > 0,
      detail:
        douyinAccounts.length === 0
          ? '没有带 Cookie 的 browser_assist 账号，请先在「集成 → 平台账号」扫码登录测试账号'
          : douyinActive
              .map(
                (a) =>
                  `${a.name}（健康检查 ${daysAgo(a.lastHealthCheckAt)}${
                    a.expiresAt ? `，凭证 ${daysAgo(a.expiresAt)}到期` : ''
                  }）`
              )
              .join('；')
    });

    // 3. Xiaohongshu account (Runbook 3.3)
    const xhsAccounts = await db.platformAccount.findMany({
      where: {
        platform: 'xiaohongshu',
        mode: 'browser_assist',
        deletedAt: null,
        cookieRef: { not: '' }
      },
      select: { name: true, status: true, lastHealthCheckAt: true }
    });
    const xhsActive = xhsAccounts.filter((a) => a.status === 'active');
    checks.push({
      name: '小红书扫码账号（Runbook 3.3 低量采集）',
      ok: xhsActive.length > 0,
      detail:
        xhsAccounts.length === 0
          ? '可选步骤：没有小红书账号，如需验收请扫码登录测试账号'
          : xhsActive
              .map((a) => `${a.name}（健康检查 ${daysAgo(a.lastHealthCheckAt)}）`)
              .join('；')
    });

    // 4. Feishu sink config (Runbook 3.2) — mock seed configs are not usable
    const feishuSinks = await db.leadSinkConfig.findMany({
      where: { enabled: true, sinkType: { in: ['lark', 'feishu', 'feishu_bitable'] } },
      select: { sinkType: true, config: true }
    });
    const realFeishu = feishuSinks.filter((s) => {
      const c = s.config as Record<string, unknown> | null;
      if (!c) return false;
      const appId = typeof c.appId === 'string' ? c.appId : '';
      const appToken = typeof c.appToken === 'string' ? c.appToken : '';
      const tableId = typeof c.tableId === 'string' ? c.tableId : '';
      return (
        Boolean(c.appSecret) &&
        appId.length > 0 &&
        !/^mock/i.test(appId) &&
        !/^mock/i.test(appToken) &&
        !/^mock/i.test(tableId)
      );
    });
    checks.push({
      name: '飞书多维表格配置（Runbook 3.2 写入验收）',
      ok: realFeishu.length > 0,
      detail:
        realFeishu.length > 0
          ? `已启用真实配置：${realFeishu.map((s) => s.sinkType).join('、')}`
          : feishuSinks.length > 0
            ? '只有 mock 种子配置，请在「集成 → 同步与推送」填写真实飞书应用凭据（App ID/Secret、表格 AppToken/TableId）'
            : '未配置飞书 lead sink，请在「集成 → 同步与推送」填写 App Token / Table ID'
    });

    // 5. LLM config (needed for prospecting analysis)
    const llmConfigs = await db.appConfig.count({
      where: { key: { startsWith: 'llm_config' } }
    });
    checks.push({
      name: 'LLM 配置（小红书获客分析需要）',
      ok: llmConfigs > 0,
      detail:
        llmConfigs > 0
          ? '组织级 LLM 配置已存在'
          : '未检测到 LLM 配置，请在「集成 → LLM」配置后再执行小红书采集'
    });
  } finally {
    await db.$disconnect();
  }

  // 6. Written approval form (file-based, outside DB). The shipped template
  // does not count — only a copied, filled-in approval does.
  const approvals = existsSync(EVIDENCE_DIR)
    ? readdirSync(EVIDENCE_DIR).filter(
        (file) =>
          file.startsWith('APPROVAL') &&
          file.endsWith('.md') &&
          file !== 'APPROVAL-TEMPLATE.md'
      )
    : [];
  checks.push({
    name: '书面批准单（Runbook 第 2 节）',
    ok: approvals.length > 0,
    detail:
      approvals.length > 0
        ? `已归档：${approvals.join('、')}`
        : '未找到批准单。复制 docs/delivery/acceptance-evidence/APPROVAL-TEMPLATE.md 填写后归档'
  });

  console.log('\n真实平台验收就绪检查（只读，不发送任何内容）\n');
  for (const check of checks) {
    const mark = check.ok ? '✅' : '⚠️ ';
    console.log(`${mark} ${check.name}`);
    console.log(`   ${check.detail}\n`);
  }

  const blocking = checks.filter((c) => !c.ok);
  if (blocking.length === 0) {
    console.log('结论：全部前置条件就绪，填写批准单后即可按 Runbook 执行验收。');
  } else {
    console.log(
      `结论：${blocking.length} 项未就绪（${blocking
        .map((c) => c.name)
        .join('、')}）。就绪后重跑：pnpm acceptance:readiness`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
