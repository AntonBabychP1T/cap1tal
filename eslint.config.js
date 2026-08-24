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
]);
