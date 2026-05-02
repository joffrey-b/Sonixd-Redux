module.exports = {
  ignorePatterns: ['.eslintrc.js'],
  extends: [
    'airbnb-typescript',
    'plugin:react/recommended',
    'plugin:import/typescript',
    'plugin:@typescript-eslint/recommended',
    'plugin:jest/recommended',
    'plugin:promise/recommended',
    'plugin:compat/recommended',
    'plugin:react-hooks/recommended',
    'plugin:prettier/recommended',
  ],
  plugins: [
    '@typescript-eslint',
    'react',
    'react-hooks',
    'import',
    'jsx-a11y',
    'jest',
    'promise',
    'compat',
    'prettier',
  ],
  env: {
    browser: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  rules: {
    // A temporary hack related to IDE not resolving correct package.json
    '@typescript-eslint/lines-between-class-members': 'off',
    '@typescript-eslint/no-throw-literal': 'off',
    // import plugin rules not loading correctly with this ESLint 8 config chain
    'import/extensions': 'off',
    'import/no-cycle': 'off',
    'import/first': 'off',
    'import/no-extraneous-dependencies': 'off',
    'import/prefer-default-export': 'off',
    // jsx-a11y rules not loading correctly with this ESLint 8 config chain
    'jsx-a11y/no-static-element-interactions': 'off',
    'jsx-a11y/click-events-have-key-events': 'off',
    'jsx-a11y/no-noninteractive-element-interactions': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-shadow': 'off',
    'no-underscore-dangle': 'off',
    'no-console': 'off',
    'jsx-quotes': ['error', 'prefer-double'],
    'react/jsx-props-no-spreading': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'no-nested-ternary': 'off',
    'react/no-unescaped-entities': [
      'error',
      {
        forbid: ['>', "'", '}'],
      },
    ],
  },
  overrides: [
    {
      // Plain JS files legitimately use require() — disable TS-specific import rules
      files: ['*.js', '*.jsx'],
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
    createDefaultProgram: true,
  },
  settings: {
    react: {
      version: 'detect',
    },
    'import/resolver': {
      // See https://github.com/benmosher/eslint-plugin-import/issues/1396#issuecomment-575727774 for line below
      node: {},
      webpack: {
        config: require.resolve('./.erb/configs/webpack.config.eslint.js'),
      },
    },
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx'],
    },
  },
};
