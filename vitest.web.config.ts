import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/web/**/*.test.ts', 'tests/web/**/*.test.tsx'],
    setupFiles: ['tests/setup/web.setup.ts'],
  },
});
