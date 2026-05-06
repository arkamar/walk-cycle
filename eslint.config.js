import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.vitest,
        ...globals.node,
      },
    },
  },
];
