import { defineConfig } from 'drizzle-kit';

// Schema lives in src/db/schema.ts; `npm run db:generate` writes SQL migrations into drizzle/.
// Committed migrations are immutable — see .claude/rules/database.md.
export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
