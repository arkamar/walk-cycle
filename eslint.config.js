import js from '@eslint/js';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';
import sonarjs from 'eslint-plugin-sonarjs';

export default [
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  },
  js.configs.recommended,
  stylistic.configs.recommended,
  sonarjs.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // SonarJS rules are enabled in later commits, together with the fixes
      // they require, so every commit stays lint-clean.
      'sonarjs/cognitive-complexity': ['error', 60],
      'sonarjs/no-os-command-from-path': 'off',
      'sonarjs/parameterized-tests': 'off',

      // Strict correctness and modern-JS best practices
      'array-callback-return': 'error',
      'curly': ['error', 'all'],
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-async-promise-executor': 'error',
      'no-duplicate-imports': 'error',
      'no-implicit-coercion': ['error', { allow: ['!!'] }],
      'no-implied-eval': 'error',
      'no-loop-func': 'error',
      'no-lonely-if': 'error',
      'no-multi-spaces': 'error',
      'no-multi-str': 'error',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-octal-escape': 'error',
      'no-param-reassign': ['error', { props: false }],
      'no-promise-executor-return': 'error',
      'no-return-assign': 'error',
      'no-script-url': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-shadow': 'error',
      'no-throw-literal': 'error',
      'no-unassigned-vars': 'error',
      'no-void': 'error',
      'no-unexpected-multiline': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
      'no-useless-assignment': 'error',
      'no-useless-call': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-concat': 'error',
      'no-useless-constructor': 'error',
      'no-useless-rename': 'error',
      'no-useless-return': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-const': 'error',
      'prefer-numeric-literals': 'error',
      'prefer-object-spread': 'error',
      'prefer-promise-reject-errors': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'prefer-template': 'error',
      'require-await': 'error',
      'yoda': 'error',

      // Override stylistic recommended rules to match existing code style
      '@stylistic/indent': ['error', 2, { SwitchCase: 1 }],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/key-spacing': ['error', { beforeColon: false, afterColon: true, mode: 'strict' }],
      '@stylistic/list-style': 'error',
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
      '@stylistic/space-before-function-paren': ['error', { anonymous: 'never', named: 'never', asyncArrow: 'always' }],
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
