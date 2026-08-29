import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '.mongo-data/**',
      'server/src/db/seed-data/**',
      '**/*.min.js',
    ],
  },

  js.configs.recommended,

  // --- Server: TypeScript, Node ------------------------------------------
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['server/**/*.ts'],
  })),
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
    },
    rules: {
      // An unused argument is often a deliberate signature match (Express
      // error handlers need four parameters); an underscore marks intent.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // --- Frontend: React, browser -------------------------------------------
  {
    files: ['frontend/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Fetch-on-mount sets state from a promise callback, which this rule
      // cannot see through and reports as a synchronous cascade. Kept as a
      // warning so a genuine synchronous setState still stands out.
      'react-hooks/set-state-in-effect': 'warn',
      // Reports that the React Compiler would bail out on a component. The
      // build does not run the compiler, so this is advisory, not a defect.
      'react-hooks/preserve-manual-memoization': 'warn',
      // A context module exporting both its provider and its hook is the
      // conventional shape; it only costs fast-refresh granularity.
      'react-refresh/only-export-components': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^[A-Z_]' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // Config files run in Node.
  {
    files: ['**/*.config.js', 'eslint.config.js', 'scripts/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
