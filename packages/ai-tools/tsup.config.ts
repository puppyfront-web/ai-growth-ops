import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: [
    'src/index.ts',
    'src/adapters/vercel-ai.ts',
    'src/adapters/raw-sdk.ts',
    'src/plan-templates.ts'
  ],
  format: ['esm'],
  sourcemap: true,
  splitting: false
});
