import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsonc from 'eslint-plugin-jsonc';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/.next-*/**',
      '.tmp-tests/**',
      'coverage/**',
      'node_modules/**',
      'packages/database/src/generated/**',
      'playwright-report/**',
      'release/**',
      'test-results/**'
    ]
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' } }
  },
  // JSON files
  jsonc.configs['recommended-with-json'],
  jsonc.configs['recommended-with-jsonc'],
  {
    files: ['**/*.json', '**/*.jsonc'],
    rules: {
      'jsonc/sort-array-values': 'off',
      'jsonc/sort-keys': 'off'
    }
  },
  // JS/TS files
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs'],
    languageOptions: {
      parserOptions: {
        projectService: false
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ]
    }
  },
  // UI 护栏（docs/ui-ux-upgrade-plan.md A0）：web 业务代码禁止绕过设计系统——
  // 裸 <select>、text-white、hex 颜色、任意字号一律报错，视觉决策只能走 token 与 ui 组件。
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='select']",
          message:
            '禁止裸 <select>：请使用 @/components/ui/select（或 ui/native-select）'
        },
        {
          selector: "Literal[value=/(?:^|[\\s\"'])text-white(?:[\\s\"']|$)/]",
          message:
            '禁止 text-white：请使用语义前景色（如 text-primary-foreground / *-foreground token）'
        },
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{6,8}\\b/]',
          message:
            '禁止硬编码 hex 颜色：请使用语义 token（primary / success / chart-1..5 等）'
        },
        {
          selector: "Literal[value=/(?:^|[\\s\"'])text-\\[[^\\]]*px(?:[\\s\"']|$)/]",
          message:
            '禁止任意字号 text-[Npx]：请使用标准字阶（text-xs / sm / base / lg / xl / 2xl）'
        }
      ]
    }
  },
  {
    // 豁免：设计系统原语实现与平台品牌色隔离层（PlatformIcon/图表平台色映射）
    files: ['apps/web/src/components/ui/**', 'apps/web/src/lib/constants.ts'],
    rules: {
      'no-restricted-syntax': 'off'
    }
  }
);
