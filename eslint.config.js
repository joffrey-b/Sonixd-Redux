'use strict';

const { FlatCompat } = require('@eslint/eslintrc');
const globals = require('globals');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const importPlugin = require('eslint-plugin-import');
const jsxA11y = require('eslint-plugin-jsx-a11y');
const compatPlugin = require('eslint-plugin-compat');
const jest = require('eslint-plugin-jest');
const promise = require('eslint-plugin-promise');
const prettier = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

// FlatCompat bridges legacy eslintrc-style configs that have no flat-config export yet.
const flatCompat = new FlatCompat({ baseDirectory: __dirname });

module.exports = [
  // ── Global ignores (migrated from .eslintignore) ─────────────────────────
  {
    ignores: [
      'eslint.config.js',
      // Build outputs
      'release/**',
      '**/dist/**',
      '**/dll/**',
      'build/Release/**',
      'coverage/**',
      'lib-cov/**',
      // Compiled renderer/main bundles (prod and dev)
      'src/*.built.js',
      'src/*.main.prod.js',
      'src/main.prod.js',
      'src/main.prod.js.map',
      'src/preload.prod.js',
      'src/renderer.prod.js',
      'src/renderer.prod.js.map',
      'src/style.css',
      'src/style.css.map',
      'main.js',
      'main.js.map',
      // Generated CSS type declarations
      '**/*.css.d.ts',
      '**/*.sass.d.ts',
      '**/*.scss.d.ts',
      // Misc
      '.eslintcache',
      '__snapshots__/**',
      '.erb/scripts/**',
      '.erb/mocks/**',
      '.erb/configs/**',
    ],
  },

  // ── Explicit plugin registration ──────────────────────────────────────────
  // eslint-plugin-import and jsx-a11y don't have flat config exports — register
  // them here so they're available when FlatCompat loads the airbnb config that
  // references them by namespace string.
  {
    plugins: {
      import: importPlugin,
      'jsx-a11y': jsxA11y,
    },
  },

  // ── Legacy configs via FlatCompat ─────────────────────────────────────────
  // airbnb-typescript: Airbnb style guide for TypeScript. No flat config export.
  ...flatCompat.extends('airbnb-typescript'),

  // ── Native flat configs ────────────────────────────────────────────────────
  // @typescript-eslint recommended (array of 3 config objects)
  ...tsPlugin.configs['flat/recommended'],

  // eslint-plugin-react recommended (flat config)
  react.configs.flat.recommended,

  // eslint-plugin-jest recommended (flat config)
  jest.configs['flat/recommended'],

  // eslint-plugin-promise recommended (flat config)
  promise.configs['flat/recommended'],

  // eslint-plugin-compat recommended (flat config, requires ESLint 9+)
  compatPlugin.configs['flat/recommended'],

  // eslint-plugin-react-hooks: register plugin and use only the two classic
  // rules. The v7 "flat.recommended" also enables React Compiler rules
  // (set-state-in-effect, use-memo, purity, etc.) that are not appropriate
  // for a project not using the React Compiler — those will be evaluated
  // during the audit phase.
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // ── Main config ───────────────────────────────────────────────────────────
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import/resolver': {
        node: {},
        webpack: {
          config: require.resolve('./.erb/configs/webpack.config.eslint.js'),
        },
      },
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'],
      },
    },
    rules: {
      // ── Disabled TypeScript rules ──────────────────────────────────────────
      // Rule was renamed in @typescript-eslint v6; the old name no longer exists.
      '@typescript-eslint/lines-between-class-members': 'off',
      // Superseded by @typescript-eslint/only-throw-error in v6.
      '@typescript-eslint/no-throw-literal': 'off',
      // Promote to error — all remaining suppressions are documented with eslint-disable comments.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-shadow': 'off',
      // Warn on non-null assertions — crashes at runtime when value is actually null/undefined.
      '@typescript-eslint/no-non-null-assertion': 'error',

      // ── Disabled import rules ──────────────────────────────────────────────
      // These fail in the current webpack alias / monorepo setup.
      'import/extensions': 'off',
      'import/no-cycle': 'warn',
      'import/first': 'off',
      'import/no-extraneous-dependencies': 'off',
      'import/prefer-default-export': 'off',

      // ── jsx-a11y rules ─────────────────────────────────────────────────────
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-noninteractive-element-interactions': 'error',

      // ── Disabled base rules ────────────────────────────────────────────────
      'no-underscore-dangle': 'off',
      'no-console': 'error',
      'no-nested-ternary': 'off',

      // ── Configured rules ───────────────────────────────────────────────────
      'jsx-quotes': ['error', 'prefer-double'],
      'react/jsx-props-no-spreading': 'off',
      'react/no-unescaped-entities': ['error', { forbid: ['>', "'", '}'] }],
    },
  },

  // ── Prettier (must be last) ────────────────────────────────────────────────
  // Registers the prettier plugin and disables all ESLint formatting rules that
  // would conflict with prettier's output.
  {
    plugins: { prettier },
    rules: {
      'prettier/prettier': 'error',
      ...prettierConfig.rules,
    },
  },

  // ── JS/JSX overrides ──────────────────────────────────────────────────────
  // Plain .js/.jsx files in .erb/ legitimately use require() — disable the
  // TypeScript-specific import rules for them.
  {
    files: ['**/*.js', '**/*.jsx'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
];
