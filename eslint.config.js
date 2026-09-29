import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Feature isolation: features import own-feature code relatively, so any
    // absolute `@/features/…` here is cross-feature. Features never use pages.
    files: ['apps/web/src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features', '@/features/*', '@/features/**'],
              message: 'Import own-feature code relatively; no cross-feature imports.',
            },
            {
              group: ['@/pages', '@/pages/*', '@/pages/**'],
              message: 'Features must not import pages.',
            },
          ],
        },
      ],
    },
  },
  {
    // Shared layers stay app-agnostic: lib/ and components/ never depend on
    // features, the app shell, or pages.
    files: [
      'apps/web/src/lib/**/*.{ts,tsx}',
      'apps/web/src/components/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features', '@/features/*', '@/features/**'],
              message: 'Shared layers must not import features.',
            },
            {
              group: ['@/app', '@/app/*', '@/app/**'],
              message: 'Shared layers must not import app.',
            },
            {
              group: ['@/pages', '@/pages/*', '@/pages/**'],
              message: 'Shared layers must not import pages.',
            },
          ],
        },
      ],
    },
  },
  {
    // ADR-02 rule 1 — no reaching into another module's repository.
    // Cross-module calls go through that module's service.ts, so repository.ts
    // stays a private implementation detail and can change without ripple.
    // Declared before the repository-specific block below so that one, which is
    // more specific, can extend this rule instead of replacing it (ESLint gives
    // the later matching config's value for the same rule key).
    files: ['apps/api/src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*/repository.js', '../*/*/repository.js', '**/modules/*/repository.js'],
              message:
                "Cross-module calls go through the other module's service.ts, never its repository.ts (ADR-02).",
            },
          ],
        },
      ],
    },
  },
  {
    // ADR-02 rule 2 — repository.ts is Drizzle queries only (spec §9.3).
    // Express types here would mean SQL leaking into HTTP concerns.
    // Patterns from the block above are repeated because ESLint applies the
    // last matching config's value for a given rule key, not a merge.
    files: ['apps/api/src/modules/**/repository.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*/repository.js', '../*/*/repository.js', '**/modules/*/repository.js'],
              message:
                "Cross-module calls go through the other module's service.ts, never its repository.ts (ADR-02).",
            },
            {
              group: ['express', 'express/*', 'express/**'],
              message: 'repository.ts holds Drizzle queries only — no Express types (§9.3, ADR-02).',
            },
          ],
        },
      ],
    },
  },
  {
    rules: {
      // `declare global { namespace Express { … } }` is the standard
      // Express module-augmentation pattern — declarations only.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/drizzle/**'],
  },
);
