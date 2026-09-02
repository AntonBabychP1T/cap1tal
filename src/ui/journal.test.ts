import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendBounded, JOURNAL_LIMIT, type JournalEntry } from '../reporting/journal';
import type { JournalStorage } from './journal';
import { bindJournal, journal, reportFailure, reportFailureEntry, resetJournalForTests } from './journal';

/** The storage double: `src/db/reporting-repo.ts`'s rules, in memory. */
function inMemoryJournal(limit = 500): JournalStorage & { rows: () => readonly JournalEntry[] } {
  let entries: readonly JournalEntry[] = [];
  return {
    append: (entry) => {
      entries = appendBounded(entries, entry, limit);
    },
    tail: () => entries,
    byId: (id) => entries.find((entry) => entry.id === id) ?? null,
    rows: () => entries,
  };
}

const AT = new Date('2026-09-02T14:00:00.000Z');

let counter = 0;
const options = { now: () => AT, newId: () => `e${(counter += 1)}` };

describe('the журнал the app writes', () => {
  beforeEach(() => {
    counter = 0;
    resetJournalForTests();
  });
  afterEach(() => resetJournalForTests());

  it('Scenario: A refused save is an entry with the refusal text', () => {
    const storage = inMemoryJournal();
    bindJournal(storage, options);

    const shown = reportFailure('local-save', new Error('Оберіть рахунок'));

    // The dialog says exactly what it said before — the journal is beside that, not instead of it.
    expect(shown).toBe('Оберіть рахунок');
    expect(storage.rows()).toEqual([
      { id: 'e1', at: AT, kind: 'failure', name: 'local-save', detail: 'Оберіть рахунок' },
    ]);
  });

  it('hands back the entry id, so a dialog can say which failure it is offering to report', () => {
    const storage = inMemoryJournal();
    bindJournal(storage, options);

    const { id, message } = reportFailureEntry('account-rename', new Error('Рахунок вже існує'));

    expect(message).toBe('Рахунок вже існує');
    expect(storage.byId(id)?.detail).toBe('Рахунок вже існує');
  });

  it('records what the app was doing before a failure, and a failure shown in place', () => {
    const storage = inMemoryJournal();
    bindJournal(storage, options);

    journal.record('screen', '/manage/backup');
    journal.failure('backup-save', 'Немає місця на пристрої');
    journal.record('alert', 'backup');

    expect(storage.rows().map((e) => [e.kind, e.name, e.detail ?? null])).toEqual([
      ['screen', '/manage/backup', null],
      ['failure', 'backup-save', 'Немає місця на пристрої'],
      ['alert', 'backup', null],
    ]);
  });

  it('keeps what happened before the migrations, and writes it in order once storage arrives', () => {
    // The most interesting crash of all is the one during launch, and storage does not exist yet.
    journal.record('screen', '/');
    journal.record('crash', 'render', 'Boom');
    const storage = inMemoryJournal();

    // Readable from the buffer meanwhile, so nothing has to know whether binding has happened.
    expect(journal.tail().map((e) => e.name)).toEqual(['/', 'render']);

    bindJournal(storage, options);

    expect(storage.rows().map((e) => [e.kind, e.name])).toEqual([
      ['screen', '/'],
      ['crash', 'render'],
    ]);
    expect(journal.tail()).toHaveLength(2);
  });

  it('bounds the buffer too, so a launch that never binds still holds at most 500', () => {
    // The one case where the buffer is the whole журнал: the migrations never succeed, so `bind`
    // never happens. «At most the most recent 500» has to be true of it as well.
    for (let i = 0; i < JOURNAL_LIMIT + 1; i += 1) {
      journal.record('screen', `/route/${i}`);
    }

    const tail = journal.tail();
    expect(tail).toHaveLength(JOURNAL_LIMIT);
    expect(tail.map((e) => e.name).slice(0, 1)).toEqual(['/route/1']);
    expect(tail.map((e) => e.name).slice(-1)).toEqual([`/route/${JOURNAL_LIMIT}`]);
  });

  it('finds a buffered entry by id before anything is bound', () => {
    const id = journal.record('crash', 'render', 'Boom at launch');

    expect(journal.byId(id)?.detail).toBe('Boom at launch');
    expect(journal.byId('nothing')).toBeNull();
  });

  it('binds once: a second bind replays nothing and keeps the first storage', () => {
    journal.record('screen', '/');
    const first = inMemoryJournal();
    const second = inMemoryJournal();

    bindJournal(first, options);
    // `retry` on the crash fallback remounts the whole root layout, so this really happens.
    bindJournal(second, options);
    journal.record('screen', '/(tabs)/month');

    expect(first.rows().map((e) => e.name)).toEqual(['/', '/(tabs)/month']);
    expect(second.rows()).toEqual([]);
  });

  it('never turns a failure it cannot record into a crash', () => {
    // A screen calls this from inside a catch, on its way to showing the owner a dialog. Storage
    // that throws must cost an entry, never the dialog.
    bindJournal(
      {
        append: () => {
          throw new Error('database is locked');
        },
        tail: () => [],
        byId: () => null,
      },
      options,
    );

    expect(reportFailure('local-save', new Error('Оберіть рахунок'))).toBe('Оберіть рахунок');
    expect(() => journal.record('crash', 'render', 'Boom')).not.toThrow();
  });

  it('says what a non-Error refusal was, as the dialogs always have', () => {
    const storage = inMemoryJournal();
    bindJournal(storage, options);

    expect(reportFailure('local-save', 'просто рядок')).toBe('просто рядок');
    expect(storage.rows()[0]?.detail).toBe('просто рядок');
  });
});
