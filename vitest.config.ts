import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
      '@ai-growth-ops/database': fileURLToPath(
        new URL('./packages/database/src/index.ts', import.meta.url)
      ),
      '@ai-growth-ops/shared': fileURLToPath(
        new URL('./packages/shared/src/index.ts', import.meta.url)
      ),
      '@ai-growth-ops/providers': fileURLToPath(
        new URL('./packages/providers/src/index.ts', import.meta.url)
      ),
      '@ai-growth-ops/capability-schema': fileURLToPath(
        new URL('./packages/capability-schema/src/index.ts', import.meta.url)
      ),
      '@ai-growth-ops/observability': fileURLToPath(
        new URL('./packages/observability/src/index.ts', import.meta.url)
      ),
      '@ai-growth-ops/skills': fileURLToPath(
        new URL('./packages/skills/src/index.ts', import.meta.url)
      ),
      '@ai-growth-ops/connectors': fileURLToPath(
        new URL('./packages/connectors/src/index.ts', import.meta.url)
      ),
      '@ai-growth-ops/email': fileURLToPath(
        new URL('./packages/email/src/index.ts', import.meta.url)
      ),
      '@ai-growth-ops/ai': fileURLToPath(
        new URL('./packages/ai/src/index.ts', import.meta.url)
      ),
      '@ai-growth-ops/ai-tools': fileURLToPath(
        new URL('./packages/ai-tools/src/index.ts', import.meta.url)
      ),
      '@ai-growth-ops/ai-tools/adapters/vercel-ai': fileURLToPath(
        new URL('./packages/ai-tools/src/adapters/vercel-ai.ts', import.meta.url)
      ),
      '@ai-growth-ops/ai-tools/adapters/raw-sdk': fileURLToPath(
        new URL('./packages/ai-tools/src/adapters/raw-sdk.ts', import.meta.url)
      ),
      '@ai-growth-ops/ai-tools/plan-templates': fileURLToPath(
        new URL('./packages/ai-tools/src/plan-templates.ts', import.meta.url)
      ),
      '@ai-growth-ops/lead-sinks': fileURLToPath(
        new URL('./packages/lead-sinks/src/index.ts', import.meta.url)
      ),
      '@ai-growth-ops/shared-types': fileURLToPath(
        new URL('./packages/shared-types/src/index.ts', import.meta.url)
      ),
      '@ai-growth-ops/runtime': fileURLToPath(
        new URL('./packages/runtime/src/index.ts', import.meta.url)
      ),
      '@ai-growth-ops/runtime-mcp': fileURLToPath(
        new URL('./packages/runtime-mcp/src/index.ts', import.meta.url)
      )
    }
  },
  test: {
    environment: 'node',
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    fileParallelism: false,
    globals: true,
    include: ['tests/**/*.test.ts'],
    maxWorkers: 1,
    setupFiles: ['tests/setup/vitest.setup.ts']
  }
});
