// ESLint 9 düz yapılandırma — Expo kural seti
const expoConfig = require('eslint-config-expo/flat');

// @typescript-eslint kuralları, eklentinin kayıtlı olduğu yapı nesnesine eklenir
const tsIndex = expoConfig.findIndex((c) => c.plugins && c.plugins['@typescript-eslint']);
if (tsIndex >= 0) {
  expoConfig[tsIndex] = {
    ...expoConfig[tsIndex],
    rules: {
      ...(expoConfig[tsIndex].rules ?? {}),
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  };
}

module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/', '.expo/', 'dist/', 'supabase/functions/'],
  },
  {
    files: ['jest.setup.js', 'jest.config.js', 'eslint.config.js', 'supabase/**/*.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        require: 'readonly',
      },
    },
  },
];
