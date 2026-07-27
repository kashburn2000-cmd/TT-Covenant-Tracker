import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// Minimal config: two rules, both for crashes the build happily ships.
//   no-undef            — a missed import after moving code between files.
//   rules-of-hooks      — a hook below an early return. The component renders
//                         fine until the state that skips the return flips,
//                         then React unmounts the whole tree and the page goes
//                         blank. (This is what broke the Leasing tab.)
export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
];
