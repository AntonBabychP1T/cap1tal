import { defineConfig } from 'vitest/config';

// Vitest covers pure TypeScript: src/domain, src/db (in-memory SQLite) and src/ui (screen logic
// with no React imports). React Native components are not tested here; see .claude/rules/testing.md.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
