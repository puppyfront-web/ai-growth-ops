/**
 * 潜客语义打分诊断/回放脚本（一次性，不接入业务链路）：
 * 1. 从本地库取指定任务的真实候选样本
 * 2. 用组织配置的 LLM 走 prospect-relevance-score skill 真实打分
 * 3. 输出 status/error 与新旧判级对比，用于诊断"语义打分为何回退 rules"与验收画像修复
 *
 * 用法：pnpm tsx --env-file=.env scripts/replay-prospect-scoring.ts [taskId] [limit]
 */
import { createDatabaseClient } from '../packages/database/src/client.js';
import { resolveLlmClientFromDb } from '../packages/database/src/llm-config.js';
import { getSharedSkillRunner } from '../packages/skills/src/index.js';

const taskId =
  process.argv[2] ?? '3ba8649a-5535-41fd-a503-d73b32dd6519';
const limit = Number(process.argv[3] ?? 8);

const db = createDatabaseClient();

async function main() {
  const task = await db.prospectingTask.findUnique({
    where: { id: taskId },
    select: { organizationId: true, requirement: true, intent: true }
  });
  if (!task) throw new Error(`任务不存在: ${taskId}`);

  const candidates = await db.prospectCandidate.findMany({
    where: { prospectingTaskId: taskId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      userKey: true,
      userNickname: true,
      sourceVideoTitle: true,
      content: true,
      evidence: true,
      leadLevel: true,
      relevanceScore: true,
      scoreSource: true
    }
  });
  console.log(`样本 ${candidates.length} 条，先验证 LLM 配置解析…`);

  let orgLlm = undefined as Awaited<ReturnType<typeof resolveLlmClientFromDb>>;
  if (process.env.USE_ENV_LLM === '1') {
    console.log('USE_ENV_LLM=1：跳过组织配置，强制使用 env 客户端');
  } else {
    orgLlm = await resolveLlmClientFromDb(db, task.organizationId).catch(
      (err) => {
        console.error('resolveLlmClientFromDb 失败:', err);
        return undefined;
      }
    );
    console.log('orgLlm 解析:', orgLlm ? 'OK' : 'undefined（runner 将回退 env 客户端）');
  }

  const runner = getSharedSkillRunner();
  const intent = task.intent as Record<string, unknown>;

  const input = {
    requirement: task.requirement ?? '',
    intent,
    searchQueries: [] as string[],
    highIntentKeywords: [] as string[],
    users: candidates.map((c) => ({
      userKey: c.userKey,
      userNickname: c.userNickname ?? '',
      sourceVideoTitle: c.sourceVideoTitle ?? '',
      comments: [
        ...(Array.isArray(c.evidence)
          ? (c.evidence as Array<{ content?: string }>)
              .map((e) => e?.content ?? '')
              .filter(Boolean)
          : []),
        c.content
      ].filter(Boolean)
    }))
  };

  const started = Date.now();
  const result = await runner.run<unknown, { results?: Array<Record<string, unknown>> }>({
    skillName: 'prospect-relevance-score',
    input,
    llmClient: orgLlm
  });
  console.log(
    `\nstatus=${result.status} latency=${Date.now() - started}ms${
      result.error ? `\nerror=${result.error}` : ''
    }`
  );

  if (result.output?.results) {
    const byKey = new Map(
      result.output.results.map((r) => [String(r.userKey), r])
    );
    for (const c of candidates) {
      const r = byKey.get(c.userKey);
      console.log(
        `[${c.leadLevel}|${c.scoreSource}|${c.relevanceScore}] -> [${
          r ? `${r.leadLevel}|skill|${r.relevanceScore}` : '无结果'
        }] ${String(c.content).slice(0, 40).replace(/\n/g, ' ')}`
      );
    }
  } else {
    console.log('无输出结果（results 为空）');
  }
  await db.$disconnect();
}

main().catch((err) => {
  console.error('脚本失败:', err);
  process.exit(1);
});
