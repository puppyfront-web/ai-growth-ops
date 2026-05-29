# OpenClaw Runtime Core Delivery Checklist

1. Verify Node is available:
   `node --version`
2. Run environment doctor:
   `./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts doctor`
3. List available local accounts:
   `./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts accounts:list`
4. Typecheck the runtime core:
   `./node_modules/.bin/tsc --project apps/runtime-core/tsconfig.json --noEmit`
5. List available skills:
   `./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts skills:list`
6. Verify auth check for a live platform account:
   `./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=auth.check --platforms=douyin --account=<account>`
7. Run the publish smoke path:
   `./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=douyin --content=hello`
8. If interaction operations are part of the demo, start browser-runner first:
   `./node_modules/.bin/tsx apps/browser-runner/src/server.ts`
9. If a Xiaohongshu cookie is available, run the interaction + lead smoke path:
   `AI_GROWTH_OPS_XIAOHONGSHU_COOKIE=<cookie> ./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=interaction.fetch --platforms=xiaohongshu --account=<account>`
10. If a WeChat Official cookie is available, run the auth + publish smoke path:
   `AI_GROWTH_OPS_WECHAT_OFFICIAL_COOKIE=<cookie> ./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=auth.check --platforms=wechat_official`
11. Then run the WeChat Official publish smoke path:
   `AI_GROWTH_OPS_WECHAT_OFFICIAL_COOKIE=<cookie> ./node_modules/.bin/tsx apps/runtime-core/src/entrypoints/cli.ts run --intent=publish --platforms=wechat_official --title="Demo Article" --content="hello"`
12. Run the combined smoke script:
   `./node_modules/.bin/tsx scripts/runtime-core-smoke.ts`
13. Live publish/auth scope on this machine is currently:
   - `douyin`
   - `wechat_channels` via `tencent`
   - `kuaishou`
14. Browser-runner-backed publish or interaction currently covers:
   - `xiaohongshu`
   - `wechat_official`
   - `zhihu`
   - `baijiahao`
15. Without cookie or browser-runner prerequisites, runtime-core returns a structured blocked result instead of pretending success.
16. Capture outputs from steps 2 to 12 as the delivery verification record.
