import { defineConfig } from 'tsup';

// Mirrors the repo root tsup.config.ts, with a Node shebang so the
// emitted dist/index.js is usable directly as the `growth-ops-agent` bin.
export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts', 'src/lib.ts'],
  format: ['esm'],
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' }
});
