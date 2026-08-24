/**
 * App-generated ids for accounts and transactions: TEXT, opaque, never autoincrement, so export,
 * import and a future sync cannot collide (rules/database.md). One phone with one writer makes a
 * time prefix plus a random suffix collision-safe in practice; nothing depends on the shape, so a
 * later change can strengthen it without touching storage.
 */
export function newId(): string {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${stamp}-${random}`;
}
