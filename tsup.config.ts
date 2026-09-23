import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts'],
  format: ['esm'],
  sourcemap: true,
  // 服务端产物不打包 node_modules：CJS 依赖（@prisma/client、bullmq、ioredis 等）
  // 一旦打进 ESM bundle，运行时会抛 "Dynamic require of ... is not supported"。
  // 运行时直接从镜像内的 node_modules 解析。
  esbuildOptions(options) {
    options.packages = 'external';
  }
});
