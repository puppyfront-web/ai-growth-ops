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
6. Run the interaction + lead smoke path:
   `./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=interaction.fetch --platforms=xiaohongshu`
7. Run the combined smoke script:
   `./node_modules/.bin/tsx scripts/runtime-core-smoke.ts`
8. Live publish/auth scope on this machine is currently:
   - `douyin`
   - `wechat_channels` via `tencent`
   - `kuaishou`
9. Capture outputs from steps 3 to 7 as the delivery verification record.
