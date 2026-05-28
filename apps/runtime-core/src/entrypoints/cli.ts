import { loadRuntimeConfig } from '../config/runtime-config.js';

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const config = loadRuntimeConfig();
  if (argv.includes('--print-config')) {
    console.log(JSON.stringify(config));
    return;
  }

  console.log('runtime-core ready');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
