import { CAPABILITIES } from '@ai-growth-ops/capability-schema';
import { loadRuntimeConfig } from '../config/runtime-config.js';
import { getDeliveryDoctorReport, listAvailableAccounts } from '../tools/delivery-tools.js';
import { runInteractionOps } from '../workflows/run-interaction-ops.js';
import { runLeadMining } from '../workflows/run-lead-mining.js';
import { runRuntimeRequest } from '../workflows/run-runtime-request.js';
import type { LeadCandidate } from '../graphs/lead-mining-graph.js';

function readFlag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function readPlatforms(args: string[]): string[] {
  const raw = readFlag(args, 'platforms');
  return raw ? raw.split(',').map((item) => item.trim()).filter(Boolean) : [];
}

export function resolveInteractionFetchType(
  platform: 'douyin' | 'xiaohongshu',
  args: string[],
): 'comments' | 'messages' {
  const requestedType = readFlag(args, 'type');
  if (requestedType === 'comments' || requestedType === 'messages') {
    return requestedType;
  }
  return platform === 'douyin' ? 'comments' : 'messages';
}

const USAGE = `
ai-growth-ops runtime-core CLI

Usage: tsx apps/runtime-core/src/entrypoints/cli.ts <command> [options]

Commands:
  doctor                   环境检查（API keys, cookies, browser-runner）
  accounts:list            列出各平台可用账号
  skills:list              列出已注册的 skills
  run --intent=<intent>    执行指定意图

Run intents:
  --intent=publish                                    发布内容到平台
    --platforms=douyin,xiaohongshu                    目标平台（逗号分隔）
    --account=<name>                                  指定账号
    --title="标题"                                     标题
    --content="正文"                                   正文内容
    --file=/path/to/video.mp4                          媒体文件路径

  --intent=auth.check                                 检查平台 cookie 有效性
    --platforms=douyin                                 目标平台

  --intent=auth.login                                 触发平台登录流程
    --platforms=douyin                                 目标平台

  --intent=interaction.fetch                          抓取评论/私信并 AI 分析获客
    --platforms=xiaohongshu                            目标平台
    --type=comments|messages                           互动类型（默认按平台选择）
    --account=<name>                                   指定账号

  --intent=lead.extract                               对单条内容做 AI 获客评估
    --content="内容"                                    待评估内容
    --platforms=xiaohongshu                            所属平台

  --intent=interaction.fetch-schedule                 定时周期抓取
    --platforms=xiaohongshu                            目标平台
    --type=comments|messages                           互动类型
    --interval=30                                      间隔分钟数（默认 30）

  leads:list                                           列出最近抓取的线索
    --level=A|B|C|D                                    按级别过滤（可选）
    --limit=20                                         返回数量（默认 20）

  leads:summary                                        线索统计摘要

Global options:
  --print-config        打印当前配置（JSON）
`.trim();

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [command, ...args] = argv;
  const config = loadRuntimeConfig();

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(USAGE);
    return;
  }

  if (args.includes('--print-config')) {
    console.log(JSON.stringify(config));
    return;
  }

  if (command === 'skills:list') {
    const { discoverSkillManifests } = await import('../registry/skill-manifest.js');
    const manifests = await discoverSkillManifests(config.manifestDir);
    console.log(
      JSON.stringify(
        manifests.map((manifest) => ({
          skillId: manifest.skillId,
          runtime: manifest.runtime,
          capability: manifest.capabilities[0] ?? CAPABILITIES.PUBLISH_VIDEO,
          enabled: manifest.enabled,
          healthy: manifest.healthy,
        })),
      ),
    );
    return;
  }

  if (command === 'accounts:list') {
    const accounts = await listAvailableAccounts();
    console.log(JSON.stringify(accounts));
    return;
  }

  if (command === 'doctor') {
    const report = await getDeliveryDoctorReport();
    console.log(JSON.stringify(report));
    return;
  }

  if (command === 'run') {
    const intent = readFlag(args, 'intent');
    const platforms = readPlatforms(args);
    const content = readFlag(args, 'content') ?? 'hello';
    const account = readFlag(args, 'account');
    const title = readFlag(args, 'title');
    const file = readFlag(args, 'file');
    const source = readFlag(args, 'source');

    if (intent === 'publish') {
      const result = await runRuntimeRequest({
        requestId: 'cli-run-publish',
        intent: 'publish',
        payload: {
          platforms,
          account,
          title,
          content,
          mediaFilePaths: file ? [file] : undefined,
          source,
        },
      });
      console.log(JSON.stringify(result));
      return;
    }

    if (intent === 'auth.check' || intent === 'auth.login') {
      const platform = platforms[0] ?? 'douyin';
      const result = await runRuntimeRequest({
        requestId: `cli-run-${intent}`,
        intent,
        payload: {
          platform,
          account,
        },
      });
      console.log(JSON.stringify(result));
      return;
    }

    if (intent === 'interaction.fetch') {
      const platform = (platforms[0] ?? 'xiaohongshu') as 'douyin' | 'xiaohongshu';
      const interactionType = resolveInteractionFetchType(platform, args);
      const interaction = await runInteractionOps({
        platform,
        interactionType,
        account,
      });
      const lead = await runLeadMining({
        candidates: interaction.items.map((item): LeadCandidate => ({
          platform: item.platform,
          interactionType: item.interactionType as 'comment' | 'message',
          content: item.content,
          sourceContentTitle: item.sourceContentTitle,
          userNickname: item.userNickname,
        })),
      });

      // Persist leads to data directory for leads:list/summary
      try {
        const { mkdir, writeFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const leadsDir = join(config.dataDir, 'leads');
        await mkdir(leadsDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        await writeFile(
          join(leadsDir, `${ts}-${platform}-${interactionType}.json`),
          JSON.stringify(lead, null, 2),
        );
      } catch (writeError) {
        console.error('[cli] Warning: could not persist leads to data dir:', writeError);
      }

      // LLM degradation notice
      const llmSources = lead.leads.map((l) => l.classificationSource);
      const rulesCount = llmSources.filter((s) => s === 'rules').length;
      if (rulesCount > 0 && rulesCount === llmSources.length) {
        console.error('[cli] ⚠️  All classifications used rule-based fallback. Set OPENAI_API_KEY or ANTHROPIC_API_KEY to enable AI-powered classification.');
      } else if (rulesCount > 0) {
        console.error(`[cli] ⚠️  ${rulesCount}/${llmSources.length} classifications fell back to rules (LLM unavailable for some items).`);
      }

      console.log(JSON.stringify({ interaction, lead }));
      return;
    }

    if (intent === 'lead.extract') {
      const rawContent = content;
      const platform = platforms[0] ?? 'xiaohongshu';
      const lead = await runLeadMining({
        candidates: [{
          platform,
          interactionType: 'comment',
          content: rawContent,
        }],
      });
      console.log(JSON.stringify(lead));
      return;
    }

    if (intent === 'interaction.fetch-schedule') {
      const platform = (platforms[0] ?? 'xiaohongshu') as 'douyin' | 'xiaohongshu';
      const interactionType = resolveInteractionFetchType(platform, args);
      const intervalMinutes = Number(readFlag(args, 'interval') ?? '30');
      const intervalMs = intervalMinutes * 60 * 1000;

      console.error(`[schedule] Starting periodic fetch: platform=${platform}, type=${interactionType}, interval=${intervalMinutes}min`);
      console.error('[schedule] Press Ctrl+C to stop');

      const fetchOnce = async () => {
        try {
          const interaction = await runInteractionOps({ platform, interactionType, account });
          if (interaction.items.length === 0) {
            console.error(`[${new Date().toISOString()}] No new items`);
            return;
          }
          const lead = await runLeadMining({
            candidates: interaction.items.map((item): LeadCandidate => ({
              platform: item.platform,
              interactionType: item.interactionType as 'comment' | 'message',
              content: item.content,
              sourceContentTitle: item.sourceContentTitle,
              userNickname: item.userNickname,
            })),
          });
          const ts = new Date().toISOString();
          console.error(`[${ts}] Fetched ${interaction.items.length} items, classified ${lead.classified} leads: A=${lead.levelBreakdown.A} B=${lead.levelBreakdown.B} C=${lead.levelBreakdown.C} D=${lead.levelBreakdown.D}`);
          // Output only the actionable leads (A/B level) as JSON to stdout
          const actionable = lead.leads.filter((l) => l.classification.leadLevel === 'A' || l.classification.leadLevel === 'B');
          if (actionable.length > 0) {
            console.log(JSON.stringify({ ts, leads: actionable }));
          }
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Fetch failed: ${error instanceof Error ? error.message : error}`);
        }
      };

      // Run immediately, then on interval
      await fetchOnce();
      setInterval(fetchOnce, intervalMs);
      return; // keep alive via setInterval
    }
  }

  // ── leads:list ──────────────────────────────────────────────────
  if (command === 'leads:list') {
    const levelFilter = readFlag(args, 'level') as 'A' | 'B' | 'C' | 'D' | undefined;
    const limit = Number(readFlag(args, 'limit') ?? '20');

    // Read leads from data directory (stored by previous fetch+classify runs)
    const { readdir, readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const dataDir = config.dataDir;
    const leadsDir = join(dataDir, 'leads');

    let files: string[] = [];
    try {
      files = (await readdir(leadsDir)).filter((f) => f.endsWith('.json')).sort().reverse();
    } catch {
      // No leads directory yet
    }

    const leads: unknown[] = [];
    for (const file of files.slice(0, limit * 2)) {
      try {
        const raw = await readFile(join(leadsDir, file), 'utf8');
        const entry = JSON.parse(raw) as { leads?: unknown[] };
        if (entry.leads) {
          leads.push(...entry.leads);
        }
      } catch { /* skip corrupt files */ }
    }

    const filtered = levelFilter
      ? leads.filter((l: any) => l.classification?.leadLevel === levelFilter)
      : leads;

    console.log(JSON.stringify(filtered.slice(0, limit)));
    return;
  }

  // ── leads:summary ───────────────────────────────────────────────
  if (command === 'leads:summary') {
    const { readdir, readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const leadsDir = join(config.dataDir, 'leads');

    let totalRuns = 0;
    const totals = { A: 0, B: 0, C: 0, D: 0 };
    let totalErrors = 0;

    try {
      const files = (await readdir(leadsDir)).filter((f) => f.endsWith('.json'));
      totalRuns = files.length;
      for (const file of files) {
        try {
          const raw = await readFile(join(leadsDir, file), 'utf8');
          const entry = JSON.parse(raw) as { leads?: any[]; errors?: unknown[] };
          if (entry.leads) {
            for (const l of entry.leads) {
              const level = l.classification?.leadLevel as keyof typeof totals;
              if (level && level in totals) totals[level]++;
            }
          }
          totalErrors += entry.errors?.length ?? 0;
        } catch { /* skip */ }
      }
    } catch {
      // No leads directory
    }

    console.log(JSON.stringify({ totalRuns, totalLeads: totals.A + totals.B + totals.C + totals.D, breakdown: totals, totalErrors }));
    return;
  }

  // Unknown command
  console.error(`Unknown command: ${command}`);
  console.log(USAGE);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
