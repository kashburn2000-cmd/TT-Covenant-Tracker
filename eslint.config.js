import globals from 'globals';

// Minimal config: the one rule that catches a missed import after moving code
// between files (undefined identifiers are a runtime crash, not a build error).
export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 },
    },
    rules: { 'no-undef': 'error' },
  },
];
