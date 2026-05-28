import { CAPABILITIES } from '@ai-growth-ops/capability-schema';
import { loadRuntimeConfig } from '../config/runtime-config.js';
import { runInteractionOps } from '../workflows/run-interaction-ops.js';
import { runLeadMining } from '../workflows/run-lead-mining.js';
import { runRuntimeRequest } from '../workflows/run-runtime-request.js';

function readFlag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function readPlatforms(args: string[]): string[] {
  const raw = readFlag(args, 'platforms');
  return raw ? raw.split(',').map((item) => item.trim()).filter(Boolean) : [];
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [command, ...args] = argv;
  const config = loadRuntimeConfig();

  if (args.includes('--print-config')) {
    console.log(JSON.stringify(config));
    return;
  }

  if (command === 'skills:list') {
    console.log(
      JSON.stringify([
        {
          skillId: 'douyin-upload',
          runtime: 'openclaw',
          capability: CAPABILITIES.PUBLISH_VIDEO,
        },
      ]),
    );
    return;
  }

  if (command === 'run') {
    const intent = readFlag(args, 'intent');
    const platforms = readPlatforms(args);
    const content = readFlag(args, 'content') ?? 'hello';

    if (intent === 'publish') {
      const result = await runRuntimeRequest({
        requestId: 'cli-run-publish',
        intent: 'publish',
        payload: {
          platforms,
          content,
          mediaFilePaths: ['/tmp/demo.mp4'],
        },
      });
      console.log(JSON.stringify(result));
      return;
    }

    if (intent === 'interaction.fetch') {
      const platform = (platforms[0] ?? 'xiaohongshu') as 'douyin' | 'xiaohongshu';
      const interaction = await runInteractionOps({
        platform,
        interactionType: platform === 'douyin' ? 'comments' : 'messages',
      });
      const lead = await runLeadMining({
        candidates: interaction.items.map((item) => ({
          platform: item.platform,
          content: item.content,
          confidence: 0.9,
        })),
      });
      console.log(JSON.stringify({ interaction, lead }));
      return;
    }
  }

  console.log('runtime-core ready');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
