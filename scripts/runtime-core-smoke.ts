import { runCli } from '../apps/runtime-core/src/entrypoints/cli.js';

async function main() {
  await runCli(['skills:list']);
  await runCli(['run', '--intent=publish', '--platforms=douyin', '--content=hello']);
  await runCli(['run', '--intent=interaction.fetch', '--platforms=xiaohongshu']);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
