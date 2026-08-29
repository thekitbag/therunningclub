import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      // Generated Prisma client: not ours to lint or fix.
      'src/generated/**',
      'src/domain/scoring/age-grade/data/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    // Operational scripts intentionally write to stdout.
    files: ['scripts/**/*.ts', 'tests/**/*.{ts,mjs}', '*.config.ts', '*.config.mjs'],
    rules: { 'no-console': 'off' },
  },
  {
    // Node scripts and harnesses run outside the bundler.
    files: [
      'scripts/**/*.ts',
      'tests/**/*.{ts,mjs}',
      '*.config.ts',
      '*.config.mjs',
      'prisma.config.ts',
    ],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
      },
    },
  },
  {
    // The service worker runs in a worker scope with its own global set.
    files: ['public/sw.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        URL: 'readonly',
        Promise: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: { 'no-undef': 'error' },
  },
);
