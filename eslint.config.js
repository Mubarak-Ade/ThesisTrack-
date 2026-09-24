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
