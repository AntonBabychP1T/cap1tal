import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AuthFetchLike } from '../monobank/api';
import { REQUEST_TIMEOUT_NAME, withRequestTimeout } from '../monobank/yielding';
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

/**
 * The same doubles with a clock that moves a millisecond every time it is read, so a duration is
 * a number a test can pin rather than the zero a frozen clock gives every измеряемая thing.
 */
let ticks = 0;
const ticking = { now: () => new Date(AT.getTime() + (ticks += 1)), newId: () => `e${(counter += 1)}` };

describe('the журнал the app writes', () => {
  beforeEach(() => {
    counter = 0;
    ticks = 0;
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

  it('bounds the buffer too, so a launch that never binds still holds at most the bound', () => {
    // The one case where the buffer is the whole журнал: the migrations never succeed, so `bind`
    // never happens. «At most the most recent 2000» has to be true of it as well.
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

  it('writes exactly the entry it wrote before when nothing is added to the tail', () => {
    const storage = inMemoryJournal();
    bindJournal(storage, options);

    journal.record('screen', '/manage/backup');
    journal.record('alert', 'monobank-sync', 'знято');

    expect(storage.rows()).toEqual([
      { id: 'e1', at: AT, kind: 'screen', name: '/manage/backup' },
      { id: 'e2', at: AT, kind: 'alert', name: 'monobank-sync', detail: 'знято' },
    ]);
  });

  it('records the mark, the duration and the counts when it is given them', () => {
    const storage = inMemoryJournal();
    bindJournal(storage, options);

    journal.record('network', 'GET api.monobank.ua/personal/client-info', undefined, {
      run: 'r1',
      tookMs: 12,
      counts: { status: 200 },
    });

    expect(storage.rows()[0]).toEqual({
      id: 'e1',
      at: AT,
      kind: 'network',
      name: 'GET api.monobank.ua/personal/client-info',
      run: 'r1',
      tookMs: 12,
      counts: { status: 200 },
    });
  });

  describe('journal.step', () => {
    it('Scenario: The журнал records what the app itself did — both ends, under one mark', async () => {
      const storage = inMemoryJournal();
      bindJournal(storage, ticking);

      const answered = await journal.step('backup', () => Promise.resolve('done'), {
        ending: () => ({ counts: { transactions: 7 } }),
      });

      expect(answered).toBe('done');
      const rows = storage.rows();
      expect(rows.map((e) => [e.kind, e.name, e.detail])).toEqual([
        ['step', 'backup', 'почалось'],
        ['step', 'backup', 'вдалось'],
      ]);
      expect(rows[0]?.run).toBe(rows[1]?.run);
      expect(rows[0]?.run).toBeDefined();
      // Only the ending is measured: a beginning has nothing to say about how long it took.
      expect(rows[0]?.tookMs).toBeUndefined();
      expect(rows[1]?.tookMs).toBeGreaterThan(0);
      expect(rows[1]?.counts).toEqual({ transactions: 7 });
    });

    it("carries the operation's own word for what it came to", async () => {
      const storage = inMemoryJournal();
      bindJournal(storage, ticking);

      await journal.step('drive-backup', () => Promise.resolve('not-configured'), {
        run: 'r-given',
        ending: (why) => ({ detail: why }),
      });

      expect(storage.rows().map((e) => [e.detail, e.run])).toEqual([
        ['почалось', 'r-given'],
        ['not-configured', 'r-given'],
      ]);
    });

    it('writes the failing end and hands the caller back the very error that was thrown', async () => {
      const storage = inMemoryJournal();
      bindJournal(storage, ticking);
      const thrown = new Error('database is locked');

      await expect(journal.step('saldo-import', () => Promise.reject(thrown))).rejects.toBe(thrown);

      expect(storage.rows().map((e) => e.detail)).toEqual(['почалось', 'не вдалось']);
      expect(storage.rows()[1]?.tookMs).toBeGreaterThan(0);
    });
  });

  describe('journal.watchFetch', () => {
    const answer = (status: number) => ({
      ok: status < 400,
      status,
      json: () => Promise.resolve({ data: 'never read' }),
    });

    it('Scenario: A statement request is an entry', async () => {
      const storage = inMemoryJournal();
      bindJournal(storage, ticking);
      const response = answer(200);
      const watched = journal.watchFetch(
        (_url: string, _headers: Readonly<Record<string, string>>) => Promise.resolve(response),
        { run: 'r1' },
      );

      const given = await watched(
        'https://api.monobank.ua/personal/statement/kKGVoZuHWzq/1756000000/1757000000',
        { 'X-Token': 'secret-token' },
      );

      // The very object, unread: `AuthFetchLike` has no `clone()`, so one read here is the read
      // the caller is about to make.
      expect(given).toBe(response);
      expect(storage.rows()).toHaveLength(1);
      const entry = storage.rows()[0];
      expect(entry?.kind).toBe('network');
      expect(entry?.name).toBe(
        'GET api.monobank.ua/personal/statement/kKGVoZuHWzq/1756000000/1757000000',
      );
      expect(entry?.counts).toEqual({ status: 200 });
      expect(entry?.tookMs).toBeGreaterThan(0);
      expect(entry?.run).toBe('r1');
      expect(entry?.detail).toBeUndefined();
      expect(JSON.stringify(entry)).not.toContain('secret-token');
    });

    it('Scenario: A refused request is an entry with what was refused', async () => {
      const storage = inMemoryJournal();
      bindJournal(storage, ticking);
      const watched = journal.watchFetch((_url: string) => Promise.resolve(answer(429)));

      const given = await watched('https://api.monobank.ua/personal/client-info');

      // The run's own handling of it is unchanged: the answer comes back as it came back.
      expect(given.status).toBe(429);
      expect(storage.rows()[0]?.counts).toEqual({ status: 429 });
    });

    it('Scenario: A request that never got an answer is an entry too', async () => {
      const storage = inMemoryJournal();
      bindJournal(storage, ticking);
      const timeout = new Error('monobank did not answer within 30000 ms');
      timeout.name = REQUEST_TIMEOUT_NAME;
      const watched = journal.watchFetch((_url: string) => Promise.reject(timeout));

      await expect(
        watched('https://api.monobank.ua/personal/statement/kKGVoZuHWzq/1/2'),
      ).rejects.toBe(timeout);

      expect(storage.rows()[0]?.detail).toBe('не відповів');
      expect(storage.rows()[0]?.tookMs).toBeGreaterThan(0);
    });

    it("Scenario: A request that never got an answer is an entry too — over the real timeout", async () => {
      // The composition the app actually builds in `src/hooks/monobank-ports.ts`, both halves of
      // which load under `verify`: the journal wrapper *outside* `withRequestTimeout`, so the
      // entry carries the duration the run actually waited. Without this, the coupling between
      // `REQUEST_TIMEOUT_NAME` and «не відповів» is only asserted against a hand-forged name.
      const storage = inMemoryJournal();
      bindJournal(storage, ticking);
      const fired: (() => void)[] = [];
      const setTimer = (fn: () => void) => {
        fired.push(fn);
        return () => undefined;
      };
      const watched = journal.watchFetch(
        withRequestTimeout(() => new Promise(() => undefined), { setTimer, timeoutMs: 30_000 }),
      );

      const asked = watched('https://api.monobank.ua/personal/client-info', {});
      // The bank never answers; the timeout is what settles it.
      fired.forEach((fire) => fire());
      await expect(asked).rejects.toThrow('monobank did not answer within 30000 ms');

      expect(storage.rows()).toHaveLength(1);
      expect(storage.rows()[0]?.name).toBe('GET api.monobank.ua/personal/client-info');
      expect(storage.rows()[0]?.detail).toBe('не відповів');
      expect(storage.rows()[0]?.tookMs).toBeGreaterThan(0);
      // And not the timeout's own message, which is the app's but is still a caught error's text.
      expect(JSON.stringify(storage.rows())).not.toContain('did not answer');
    });

    it('never writes the caught error, which may quote the whole URL it was given', async () => {
      const storage = inMemoryJournal();
      bindJournal(storage, ticking);
      const platform = new Error(
        'Network request failed: https://cabinet.tax.gov.ua/ws/api_public/rro/chkAllWeb?fn=3000000000&sm=780.00',
      );
      const watched = journal.watchFetch((_url: string) => Promise.reject(platform));

      await expect(
        watched('https://cabinet.tax.gov.ua/ws/api_public/rro/chkAllWeb?fn=3000000000&sm=780.00'),
      ).rejects.toBe(platform);

      const written = JSON.stringify(storage.rows());
      expect(storage.rows()[0]?.detail).toBe('зірвався');
      for (const part of ['3000000000', '780.00', 'Network request failed']) {
        expect(written).not.toContain(part);
      }
    });

    it('reads the method off the arguments when the seam carries one', async () => {
      const storage = inMemoryJournal();
      bindJournal(storage, ticking);
      const watched = journal.watchFetch(
        (_url: string, _init?: { method?: string }) => Promise.resolve(answer(204)),
        { method: (init) => init?.method ?? 'GET' },
      );

      await watched('https://www.googleapis.com/drive/v3/files/1AbC2dEf3GhI', { method: 'DELETE' });

      expect(storage.rows()[0]?.name).toBe('DELETE www.googleapis.com/drive/v3/files/{id}');
    });

    it('passes through a one-argument seam and a two-argument one alike', async () => {
      bindJournal(inMemoryJournal(), ticking);

      // The чек provider's shape and the personal API's, both assigned to their own types — this
      // is a typecheck as much as a test.
      const oneArgument: (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }> =
        journal.watchFetch((_url: string) =>
          Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') }),
        );
      const twoArguments: AuthFetchLike = journal.watchFetch(
        (_url: string, _headers: Readonly<Record<string, string>>) => Promise.resolve(answer(200)),
      );

      expect((await oneArgument('https://cabinet.tax.gov.ua/ws/api_public/rro/chkAllWeb')).ok).toBe(true);
      expect((await twoArguments('https://api.monobank.ua/personal/client-info', {})).status).toBe(200);
    });
  });
});
