// Flat config in the shape `create-expo-app` generates, so the file survives scaffolding the app.
// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      'node_modules/*',
      '.expo/*',
      'android/*',
      'ios/*',
      'drizzle/*',
      'coverage/*',
      '.cache/*',
      // nested git worktrees (`.claude/worktrees/<name>`) are separate checkouts, not this tree
      '.claude/worktrees/*',
    ],
  },
  {
    rules: {
      // A deep import into react-native's internals; `disableDeepImportWarnings` in
      // babel.config.js silences the deprecation banner for the one deliberate `require()`
      // this app makes (src/app/_layout.tsx, guarded there by its own eslint-disable), so this
      // rule is the gate that catches any other reach into react-native/*, `import` or `export`.
      // See openspec/changes/bug-report/design.md D4b.
      'no-restricted-imports': ['error', { patterns: [{ group: ['react-native/*'] }] }],
    },
  },
]);
