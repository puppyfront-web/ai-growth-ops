import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsonc from 'eslint-plugin-jsonc';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '.tmp-tests/**',
      'coverage/**',
      'node_modules/**',
      'packages/database/src/generated/**',
      'playwright-report/**',
      'test-results/**'
    ]
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
  }
);
