import { readFile } from 'node:fs/promises';
import {
  parseBrowserAssistantLaunch,
  parseBrowserBridgeArgs,
  trustedBrowserAssistantOrigins
} from './config.js';
import { runBrowserBridge } from './runner.js';

/** 读取安装包构建时写入的可信 Origin 清单（紧邻 main.js）；CLI 场景无此文件。 */
async function readBakedTrustedOrigins(): Promise<string> {
  try {
    return await readFile(
      new URL('./trusted-origins.conf', import.meta.url),
      'utf8'
    );
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const protocolUrl = rawArgs.find((value) => value.startsWith('aigrowthops://'));
  const args = protocolUrl
    ? parseBrowserAssistantLaunch(
        protocolUrl,
        trustedBrowserAssistantOrigins(await readBakedTrustedOrigins())
      )
    : parseBrowserBridgeArgs(rawArgs);
  await runBrowserBridge(args);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`浏览器授权失败：${message}\n`);
  process.exitCode = 1;
});
