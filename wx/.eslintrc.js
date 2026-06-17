module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    es2020: true,
    node: true,
  },
  globals: {
    wx: 'readonly',
    App: 'readonly',
    Page: 'readonly',
    Component: 'readonly',
    Behavior: 'readonly',
    getApp: 'readonly',
    getCurrentPages: 'readonly',
    requirePlugin: 'readonly',
    __wxConfig: 'readonly',
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
  },
  overrides: [
    {
      // WXS 是受限的类 ES5 脚本（CommonJS module.exports），不属于 TS project。
      // 用默认解析器解析，否则 @typescript-eslint/parser 会因 .wxs 不在 tsconfig 报 parsing error。
      files: ['*.wxs'],
      parser: 'espree',
      parserOptions: { ecmaVersion: 2020, sourceType: 'script', project: null },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'miniprogram/miniprogram_npm/',
    'miniprogram/**/*.js',
    'typings/',
  ],
};
