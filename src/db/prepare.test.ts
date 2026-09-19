import { describe, expect, it } from 'vitest';

import { DEFAULT_BUSY_TIMEOUT_MS, prepareConnection, type StatementRunner } from './prepare';

function recordingRunner(): { run: StatementRunner; statements: string[] } {
  const statements: string[] = [];
  return { run: (sql) => statements.push(sql), statements };
}

describe('prepareConnection', () => {
  it('runs busy_timeout, then journal_mode, then foreign_keys, in that order', () => {
    const { run, statements } = recordingRunner();
    prepareConnection(run);
    expect(statements).toEqual([
      `PRAGMA busy_timeout = ${DEFAULT_BUSY_TIMEOUT_MS}`,
      'PRAGMA journal_mode = WAL',
      'PRAGMA foreign_keys = ON',
    ]);
  });

  it('swallows a journal_mode failure and still runs foreign_keys', () => {
    const statements: string[] = [];
    const run: StatementRunner = (sql) => {
      statements.push(sql);
      if (sql.includes('journal_mode')) {
        throw new Error('database is locked');
      }
    };
    expect(() => prepareConnection(run)).not.toThrow();
    expect(statements).toEqual([
      `PRAGMA busy_timeout = ${DEFAULT_BUSY_TIMEOUT_MS}`,
      'PRAGMA journal_mode = WAL',
      'PRAGMA foreign_keys = ON',
    ]);
  });

  it('an explicit bound replaces the default', () => {
    const { run, statements } = recordingRunner();
    prepareConnection(run, { busyTimeoutMs: 100 });
    expect(statements[0]).toBe('PRAGMA busy_timeout = 100');
  });
});
