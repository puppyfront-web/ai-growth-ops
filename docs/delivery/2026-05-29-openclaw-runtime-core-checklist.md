# OpenClaw Runtime Core Delivery Checklist

1. Verify Node is available:
   `node --version`
2. Typecheck the runtime core:
   `./node_modules/.bin/tsc --project apps/runtime-core/tsconfig.json --noEmit`
3. List available skills:
   `./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts skills:list`
4. Verify auth check for a live platform account:
   `./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=auth.check --platforms=douyin --account=<account>`
5. Run the publish smoke path:
   `./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=douyin --content=hello`
6. If interaction operations are part of the demo, start browser-runner first:
   `./node_modules/.bin/tsx apps/browser-runner/src/server.ts`
7. If a Xiaohongshu cookie is available, run the interaction + lead smoke path:
   `AI_GROWTH_OPS_XIAOHONGSHU_COOKIE=<cookie> ./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=interaction.fetch --platforms=xiaohongshu --account=<account>`
8. Run the combined smoke script:
   `./node_modules/.bin/tsx scripts/runtime-core-smoke.ts`
9. Live publish/auth scope on this machine is currently:
   - `douyin`
   - `wechat_channels` via `tencent`
   - `kuaishou`
10. Real interaction fetch requires cookie + browser-runner. Without them, runtime-core returns a structured blocked result instead of pretending success.
11. Capture outputs from steps 3 to 8 as the delivery verification record.
