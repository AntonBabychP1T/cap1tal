/**
 * Applies the committed migrations, tolerating a second caller doing the same at the same moment
 * (design D5): drizzle's migrator applies every pending migration in one transaction and rolls
 * back on failure, so a caller that lost the race failed *because* the winner committed — its
 * retry re-reads the migration table, finds nothing pending and returns. A migration that is
 * genuinely broken fails twice, rolled back both times, and the second failure reaches the caller
 * as today's «Не вдалося підготувати сховище».
 *
 * `await`s rather than calling straight through: `drizzle-orm/expo-sqlite/migrator`'s `migrate`
 * returns a `Promise` that rejects (the app's own shape), while `drizzle-orm/better-sqlite3/migrator`'s
 * throws synchronously (the tests' shape) — `await` catches either the same way.
 */
export async function applyMigrations(migrate: () => void | Promise<void>): Promise<void> {
  try {
    await migrate();
  } catch {
    await migrate();
  }
}
