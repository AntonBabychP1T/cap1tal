import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account, computeBalance } from '../domain/account';
import { accountsRepo } from '../db/accounts-repo';
import { monobankRepo, type MonobankRepo } from '../db/monobank-repo';
import { openTestDb, seedReferences, type TestStorage } from '../db/test-db';
import { transactionsRepo, type TransactionsRepo } from '../db/transactions-repo';
import { money } from '../domain/money';
import type { Rule } from '../domain/rules';
import {
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  type Expense,
  type Income,
  type IsoDate,
} from '../domain/transaction';
import { inMemoryMonobankTokenStore, type MonobankTokenStore } from '../platform/monobank-token';
import { startOfLocalDayMs } from '../ui/dates';
import { MAX_STATEMENT_WINDOW_MS, STATEMENT_PAGE_SIZE, type AuthFetchLike } from './api';
import { planWindows } from './sync';
import { syncLinkedAccounts, type SyncPorts, type SyncProgress, type SyncRun } from './coordinator';

/**
 * A whole sync run, against synthetic bank answers and the real database. Nothing here reaches
 * the network, waits a real millisecond or holds a real token: the API is a function that answers
 * from a script, the request gap is waited out by a recording fake, and the token is a made-up
 * string whose absence from every outcome is one of the things asserted.
 */

const TOKEN = 'uT3st_TOKENnnnnnnnnnnnnnnnnnnnnnnnnnnnnn';

const VOCABULARY = {
  categories: [UNCATEGORISED_CATEGORY_ID, 'groceries'],
  sources: [UNSOURCED_SOURCE_ID],
} as const;

const card = account({
  id: 'card',
  name: 'mono black',
  kind: 'spending',
  currency: 'UAH',
  openingBalance: money(10_000_00, 'UAH'),
});
const jarAccount = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });

/** A fixed +03:00 zone standing in for the device's, as `api.test.ts` does. */
const KYIV_OFFSET_SECONDS = 3 * 60 * 60;
const dateOf = (unixSeconds: number): IsoDate =>
  new Date((unixSeconds + KYIV_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10);

const CLIENT_INFO = {
  clientId: '3MSaMMtczs',
  name: 'Власник',
  accounts: [
    {
      id: 'mono-card',
      currencyCode: 980,
      balance: 990_000,
      creditLimit: 0,
      maskedPan: ['537541******1234'],
      type: 'black',
    },
    {
      id: 'mono-white',
      currencyCode: 980,
      balance: 15_000,
      creditLimit: 0,
      maskedPan: ['537541******9999'],
      type: 'white',
    },
  ],
  jars: [],
};

/** One statement row as monobank sends it. `time` is Unix seconds, `amount` signed minor units. */
const item = (input: {
  id: string;
  timeSeconds: number;
  description: string;
  amount: number;
  mcc?: number;
  hold?: boolean;
}) => ({
  id: input.id,
  time: input.timeSeconds,
  description: input.description,
  mcc: input.mcc ?? 4829,
  amount: input.amount,
  currencyCode: 980,
  hold: input.hold ?? false,
});

const AUGUST_28 = Math.floor(Date.UTC(2026, 7, 28, 9, 0, 0) / 1000);

/**
 * A fetch that answers from a script keyed by what is being asked. Every call is recorded, so a
 * test can prove that a rejected token was not offered twice and that an unlinked account was
 * never asked about at all.
 */
function scriptedFetch(script: {
  clientInfo?: () => { status: number; body: unknown };
  statement?: (url: string, call: number) => { status: number; body: unknown };
}) {
  const calls: string[] = [];
  const tokens: string[] = [];
  let statementCalls = 0;
  const fetchImpl: AuthFetchLike = (url, headers) => {
    calls.push(url);
    const token = headers['X-Token'];
    if (token !== undefined) {
      tokens.push(token);
    }
    const answer = url.includes('/client-info')
      ? (script.clientInfo ?? (() => ({ status: 200, body: CLIENT_INFO })))()
      : (script.statement ?? (() => ({ status: 200, body: [] })))(url, statementCalls++);
    return Promise.resolve({
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: () => Promise.resolve(answer.body),
    });
  };
  return { fetchImpl, calls, tokens, statements: () => calls.filter((u) => u.includes('/statement/')) };
}

describe('syncLinkedAccounts', () => {
  let storage: TestStorage;
  let repo: MonobankRepo;
  let txs: TransactionsRepo;
  let waits: number[];
  let progress: SyncProgress[];
  let clockMs: number;
  let ids: number;

  const RUN_AT = Date.UTC(2026, 7, 28, 12, 0, 0);
  /**
   * When a рахунок row was last written, for the tests whose subject is what the *bank's* answer
   * says. Older than the межа свіжості, so `usableAccounts` answers nothing and the run fetches
   * client-info — which is what «the token no longer shows this рахунок» is decided from. A fresh
   * row would make the run read the phone's own memory instead, and the test would be about
   * something else.
   */
  const NO_FRESH_ANSWER = new Date(RUN_AT - 3 * 60 * 60_000);
  const boundary = startOfLocalDayMs('2026-08-27');

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    accountsRepo(storage.db).save(card);
    accountsRepo(storage.db).save(jarAccount);
    repo = monobankRepo(storage.db);
    txs = transactionsRepo(storage.db);
    repo.upsertAccounts(
      [
        {
          id: 'mono-card',
          kind: 'card',
          name: 'black ··1234',
          currency: 'UAH',
          bankBalance: money(1_000_000, 'UAH'),
        },
      ],
      new Date(RUN_AT - 86_400_000),
    );
    waits = [];
    progress = [];
    clockMs = RUN_AT;
    ids = 0;
  });

  afterEach(() => {
    storage.close();
  });

  const link = (monobankAccountId: string, accountId: string, cursorMs = boundary) =>
    repo.link({ monobankAccountId, accountId, syncStartDate: '2026-08-27', cursorMs });

  function portsWith(
    fetchImpl: AuthFetchLike,
    overrides: Partial<SyncPorts> = {},
    tokenStore: MonobankTokenStore = inMemoryMonobankTokenStore({ token: TOKEN }),
    rules: readonly Rule[] = [],
  ): SyncPorts {
    return {
      tokenStore,
      fetch: fetchImpl,
      storage: repo,
      rules: () => rules,
      accounts: () => accountsRepo(storage.db).list(),
      // The clock only moves when the run waits, so pacing is entirely the run's own doing.
      nowMs: () => clockMs,
      now: () => new Date(clockMs),
      dateOf,
      wait: async (ms) => {
        waits.push(ms);
        clockMs += ms;
      },
      newId: () => `imported-${++ids}`,
      onProgress: (event) => progress.push(event),
      minRequestGapMs: 1_000,
      ...overrides,
    };
  }

  const ran = (run: SyncRun) => {
    if (run.kind !== 'ran') {
      throw new Error(`expected a run, got ${run.kind}`);
    }
    return run;
  };

  it('Scenario: A complete run reports imported transactions', async () => {
    link('mono-card', 'card');
    repo.upsertAccounts(
      [
        {
          id: 'mono-white',
          kind: 'card',
          name: 'white ··9999',
          currency: 'UAH',
          bankBalance: money(15_000, 'UAH'),
        },
      ],
      NO_FRESH_ANSWER,
    );
    link('mono-white', 'jar');
    const { fetchImpl } = scriptedFetch({
      statement: (url) =>
        url.includes('mono-card')
          ? {
              status: 200,
              body: [
                item({ id: 'a1', timeSeconds: AUGUST_28, description: 'СІЛЬПО', amount: -12550 }),
                item({ id: 'a2', timeSeconds: AUGUST_28 + 60, description: 'Uklon', amount: -8900 }),
                item({ id: 'a3', timeSeconds: AUGUST_28 + 120, description: 'Кешбек', amount: 500 }),
                item({ id: 'a4', timeSeconds: AUGUST_28 + 180, description: 'Rozetka', amount: -45000 }),
              ],
            }
          : {
              status: 200,
              body: [
                item({ id: 'b1', timeSeconds: AUGUST_28, description: 'Поповнення', amount: 100000 }),
                item({ id: 'b2', timeSeconds: AUGUST_28 + 60, description: 'Поповнення', amount: 200000 }),
                item({ id: 'b3', timeSeconds: AUGUST_28 + 90, description: 'Поповнення', amount: 300000 }),
              ],
            },
    });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    // Seven new транзакції across two accounts, each identified as complete.
    expect(run.imported).toBe(7);
    expect(run.accounts).toEqual([
      { monobankAccountId: 'mono-card', accountId: 'card', outcome: 'complete', imported: 4 },
      { monobankAccountId: 'mono-white', accountId: 'jar', outcome: 'complete', imported: 3 },
    ]);
    expect(txs.listAll()).toHaveLength(7);
    // Every linked account is visibly accounted for while the run goes on.
    expect(progress.filter((p) => p.kind === 'account').map((p) => p.of)).toEqual([2, 2]);
    expect(progress[0]).toEqual({ kind: 'started', accounts: 2 });
  });

  it('Scenario: A later sync resumes after committed work', async () => {
    link('mono-card', 'card');
    const firstWindow = scriptedFetch({
      statement: () => ({
        status: 200,
        body: [item({ id: 'a1', timeSeconds: AUGUST_28, description: 'СІЛЬПО', amount: -12550 })],
      }),
    });

    await syncLinkedAccounts(portsWith(firstWindow.fetchImpl));
    const cursorAfterFirst = repo.linkOf('mono-card')?.cursorMs;

    // The committed cursor is the run's own end — the moment through which everything is stored.
    expect(cursorAfterFirst).toBe(RUN_AT);

    // A later run, with the boundary item coming back a second time: both ends of a window are
    // inclusive, so it does arrive again, and it is skipped by its monobank item id.
    clockMs = RUN_AT + 3_600_000;
    const secondRunAt = clockMs;
    const second = scriptedFetch({
      statement: (url) => {
        expect(url).toContain(`/${Math.floor(cursorAfterFirst! / 1000)}/`);
        return {
          status: 200,
          body: [
            item({ id: 'a1', timeSeconds: AUGUST_28, description: 'СІЛЬПО', amount: -12550 }),
            item({ id: 'a2', timeSeconds: AUGUST_28 + 600, description: 'Нова', amount: -3000 }),
          ],
        };
      },
    });

    const run = ran(await syncLinkedAccounts(portsWith(second.fetchImpl)));

    expect(run.imported).toBe(1);
    expect(txs.listAll()).toHaveLength(2);
    // The run's own end, captured before it paced itself — not wherever the clock ended up.
    expect(repo.linkOf('mono-card')?.cursorMs).toBe(secondRunAt);
  });

  it('Scenario: A full answer continues the window', async () => {
    // 500 items back means the API had more to say than it fit in one page; the window is asked
    // again, narrowed to the oldest item that came, and the cursor waits until it is short.
    link('mono-card', 'card');
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, index) =>
        item({
          id: `p${from + index}`,
          // Newest first, and spread over minutes so `continueWindow` can narrow at all.
          timeSeconds: AUGUST_28 - (from + index) * 60,
          description: 'Покупка',
          amount: -100,
        }),
      );
    const cursors: number[] = [];
    const { fetchImpl, statements } = scriptedFetch({
      statement: (_url, call) => {
        cursors.push(repo.linkOf('mono-card')!.cursorMs);
        return call === 0
          ? { status: 200, body: page(0, STATEMENT_PAGE_SIZE) }
          : { status: 200, body: page(STATEMENT_PAGE_SIZE, 3) };
      },
    });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    expect(statements()).toHaveLength(2);
    expect(run.accounts[0]?.outcome).toBe('complete');
    expect(run.imported).toBe(STATEMENT_PAGE_SIZE + 3);
    // Before the second request the cursor had not moved, though the first page was committed…
    expect(cursors).toEqual([boundary, boundary]);
    expect(txs.listAll().length).toBe(STATEMENT_PAGE_SIZE + 3);
    // …and only the short answer that finished the window moved it to the run's end.
    expect(repo.linkOf('mono-card')?.cursorMs).toBe(RUN_AT);
  });

  it('A run interrupted mid-window keeps its pages and repeats them harmlessly', async () => {
    link('mono-card', 'card');
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, index) =>
        item({
          id: `p${from + index}`,
          timeSeconds: AUGUST_28 - (from + index) * 60,
          description: 'Покупка',
          amount: -100,
        }),
      );
    // The first run dies right after the full page: the second request is unavailable.
    const first = scriptedFetch({
      statement: (_url, call) =>
        call === 0
          ? { status: 200, body: page(0, STATEMENT_PAGE_SIZE) }
          : { status: 503, body: {} },
    });

    const interrupted = ran(await syncLinkedAccounts(portsWith(first.fetchImpl)));

    // The page is stored and the cursor did not move — the window is unfinished.
    expect(interrupted.accounts[0]?.outcome).toBe('unavailable');
    expect(interrupted.imported).toBe(STATEMENT_PAGE_SIZE);
    expect(repo.linkOf('mono-card')?.cursorMs).toBe(boundary);

    // The next run re-reads the very same page. Its ids are remembered, so it maps to nothing…
    //
    // An hour on, so this run fetches a client-info answer of its own: a run works up to the
    // moment of the answer it uses, so one reusing the stored answer would cover exactly the span
    // the interrupted one did and have nothing beyond the resumed вікно to ask about.
    clockMs = RUN_AT + 2 * 60 * 60_000;
    const second = scriptedFetch({
      statement: (_url, call) =>
        call === 0
          ? { status: 200, body: page(0, STATEMENT_PAGE_SIZE) }
          : { status: 200, body: page(STATEMENT_PAGE_SIZE, 2) },
    });

    const resumed = ran(await syncLinkedAccounts(portsWith(second.fetchImpl)));

    expect(resumed.imported).toBe(2);
    expect(txs.listAll()).toHaveLength(STATEMENT_PAGE_SIZE + 2);
    expect(resumed.accounts[0]?.outcome).toBe('complete');
  });

  /**
   * Where paging got to, remembered between прогони.
   *
   * The window's own end and the end the next request should ask for are stored beside the cursor,
   * so a рахунок whose window needs more pages than one прогін affords is finished by several
   * прогони instead of by none: before this, every прогін re-read the same pages, stopped in the
   * same place and left the cursor where it was (design D11).
   */
  describe('a window paged over several runs', () => {
    /** A page of items, newest first and a minute apart, so `continueWindow` can narrow at all. */
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, index) =>
        item({
          id: `p${from + index}`,
          timeSeconds: AUGUST_28 - (from + index) * 60,
          description: 'Покупка',
          amount: -100,
        }),
      );

    /** The oldest moment of `page(from, STATEMENT_PAGE_SIZE)`, in epoch milliseconds. */
    const oldestOf = (from: number) => (AUGUST_28 - (from + STATEMENT_PAGE_SIZE - 1) * 60) * 1000;

    /** The `to` a request URL carries: what `fetchStatement` writes into the path. */
    const asked = (url: string) => Number(url.slice(url.lastIndexOf('/') + 1));

    /** A run that stops itself once it has sent `after` statement requests. */
    const stopsAfter = (statements: () => readonly string[], after: number) => () =>
      statements().length >= after;

    it('Scenario: Paging stopped in the middle of a window continues in the next run', async () => {
      link('mono-card', 'card');
      const first = scriptedFetch({
        statement: (_url, call) => ({
          status: 200,
          body: page(call * STATEMENT_PAGE_SIZE, STATEMENT_PAGE_SIZE),
        }),
      });
      // Two full answers, and then the прогін runs out of what it was given before the third.
      const stopped = ran(
        await syncLinkedAccounts(
          portsWith(first.fetchImpl, { postponed: stopsAfter(first.statements, 2) }),
        ),
      );

      expect(first.statements()).toHaveLength(2);
      expect(stopped.accounts[0]?.outcome).toBe('postponed');
      // Both answers are stored and the cursor has not moved: the window is unfinished.
      expect(txs.listAll()).toHaveLength(2 * STATEMENT_PAGE_SIZE);
      expect(repo.linkOf('mono-card')?.cursorMs).toBe(boundary);
      expect(repo.linkOf('mono-card')?.paging).toEqual({
        windowToMs: RUN_AT,
        requestToMs: oldestOf(STATEMENT_PAGE_SIZE),
      });

      clockMs = RUN_AT + 3_600_000;
      const second = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });
      await syncLinkedAccounts(portsWith(second.fetchImpl));

      // The next run's first request about this рахунок asks the window narrowed to where the
      // second answer left it — not the window's first page, and not the window's own end.
      expect(asked(second.statements()[0]!)).toBe(
        Math.floor(oldestOf(STATEMENT_PAGE_SIZE) / 1000),
      );
      expect(asked(second.statements()[0]!)).not.toBe(Math.floor(RUN_AT / 1000));
    });

    it('Scenario: An account larger than one run finishes over several runs', async () => {
      link('mono-card', 'card');
      // Four pages: three full and a short one. No run affords more than two requests for it.
      const answer = (call: number) =>
        call < 3
          ? { status: 200, body: page(call * STATEMENT_PAGE_SIZE, STATEMENT_PAGE_SIZE) }
          : { status: 200, body: page(3 * STATEMENT_PAGE_SIZE, 2) };

      let sent = 0;
      const runs: string[] = [];
      // Run after run until the рахунок is done with it, and never more than a handful: the point
      // is that the pages run out, which before this change they never did.
      for (let attempt = 0; attempt < 5 && runs.at(-1) !== 'complete'; attempt += 1) {
        clockMs = RUN_AT + attempt * 3_600_000;
        const scripted = scriptedFetch({ statement: () => answer(sent++) });
        const run = ran(
          await syncLinkedAccounts(
            portsWith(scripted.fetchImpl, {
              postponed: stopsAfter(scripted.statements, 2),
            }),
          ),
        );
        runs.push(run.accounts[0]!.outcome);
      }

      // Each run worked the pages the run before it had not, instead of repeating the first two —
      // the third run only had the sliver of time the second added left to ask about.
      expect(runs).toEqual(['postponed', 'postponed', 'complete']);
      expect(sent).toBe(5);
      expect(txs.listAll()).toHaveLength(3 * STATEMENT_PAGE_SIZE + 2);
      // …and once the last page answered short the рахунок completed, so its moment moved.
      expect(repo.linkOf('mono-card')?.lastSyncedAtMs).not.toBeNull();
      expect(repo.linkOf('mono-card')?.paging).toBeNull();
    });

    it("Scenario: The cursor moves to the paged window's end, not the run's", async () => {
      link('mono-card', 'card');
      const first = scriptedFetch({
        statement: () => ({ status: 200, body: page(0, STATEMENT_PAGE_SIZE) }),
      });
      await syncLinkedAccounts(
        portsWith(first.fetchImpl, { postponed: stopsAfter(first.statements, 1) }),
      );
      expect(repo.linkOf('mono-card')?.cursorMs).toBe(boundary);

      // The second run reaches an hour further than the first ever did.
      const secondRunAt = RUN_AT + 3_600_000;
      clockMs = secondRunAt;
      const cursors: number[] = [];
      const second = scriptedFetch({
        statement: () => {
          cursors.push(repo.linkOf('mono-card')!.cursorMs);
          return { status: 200, body: page(STATEMENT_PAGE_SIZE, 2) };
        },
      });

      const finished = ran(await syncLinkedAccounts(portsWith(second.fetchImpl)));

      expect(finished.accounts[0]?.outcome).toBe('complete');
      // The window that was being paged ended at the first run's end, and that is where the
      // cursor went when it answered short — not the second run's own, later end.
      expect(cursors).toEqual([boundary, RUN_AT]);
      // …and the span between the two is asked for as a window of its own.
      expect(second.statements()).toHaveLength(2);
      expect(second.statements()[1]).toContain(`/${Math.floor(RUN_AT / 1000)}/`);
      expect(asked(second.statements()[1]!)).toBe(Math.floor(secondRunAt / 1000));
      expect(repo.linkOf('mono-card')?.cursorMs).toBe(secondRunAt);
    });

    it('Scenario: A failure over a half-paged window keeps the position', async () => {
      link('mono-card', 'card');
      const first = scriptedFetch({
        statement: (_url, call) =>
          call < 2
            ? { status: 200, body: page(call * STATEMENT_PAGE_SIZE, STATEMENT_PAGE_SIZE) }
            : { status: 503, body: {} },
      });

      const failed = ran(await syncLinkedAccounts(portsWith(first.fetchImpl)));

      expect(failed.accounts[0]?.outcome).toBe('unavailable');
      // A bad status already reads as itself on the request's own журнал entry; no reason repeats it.
      expect(failed.accounts[0]?.reason).toBeUndefined();
      // Cursor, транзакції, imported ids and the remembered position are all as they were.
      expect(repo.linkOf('mono-card')?.cursorMs).toBe(boundary);
      expect(txs.listAll()).toHaveLength(2 * STATEMENT_PAGE_SIZE);
      expect(repo.importedIds('mono-card').size).toBe(2 * STATEMENT_PAGE_SIZE);
      expect(repo.linkOf('mono-card')?.paging).toEqual({
        windowToMs: RUN_AT,
        requestToMs: oldestOf(STATEMENT_PAGE_SIZE),
      });

      // So the next run resumes that window at its third page rather than at its first.
      clockMs = RUN_AT + 3_600_000;
      const second = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });
      await syncLinkedAccounts(portsWith(second.fetchImpl));

      expect(asked(second.statements()[0]!)).toBe(
        Math.floor(oldestOf(STATEMENT_PAGE_SIZE) / 1000),
      );
    });

    it('Scenario: A position that no longer describes work left is discarded', async () => {
      link('mono-card', 'card');
      // A position whose window ends at or below the cursor — what a boundary the owner moved, or
      // a бекап restored over this phone's progress, can leave behind.
      const movedCursorMs = boundary + 6 * 3_600_000;
      repo.commitStatementAnswer({
        monobankAccountId: 'mono-card',
        transactions: [],
        newlySeenIds: [],
        bankBalance: money(1_000_000, 'UAH'),
        obtainedAt: new Date(RUN_AT),
        cursorMs: movedCursorMs,
        storedAt: new Date(RUN_AT),
        paging: { windowToMs: movedCursorMs, requestToMs: boundary + 3_600_000 },
      });

      const scripted = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });
      const run = ran(await syncLinkedAccounts(portsWith(scripted.fetchImpl)));

      // The window is planned from the cursor as if nothing had been remembered.
      expect(scripted.statements()).toHaveLength(1);
      expect(scripted.statements()[0]).toContain(`/${Math.floor(movedCursorMs / 1000)}/`);
      expect(asked(scripted.statements()[0]!)).toBe(Math.floor(RUN_AT / 1000));
      expect(run.accounts[0]?.outcome).toBe('complete');
      expect(repo.linkOf('mono-card')?.cursorMs).toBe(RUN_AT);
    });

    it('Scenario: A finished window leaves no position', async () => {
      link('mono-card', 'card');
      const first = scriptedFetch({
        statement: () => ({
          status: 200,
          body: [item({ id: 'a1', timeSeconds: AUGUST_28, description: 'СІЛЬПО', amount: -12550 })],
        }),
      });

      await syncLinkedAccounts(portsWith(first.fetchImpl));

      expect(repo.linkOf('mono-card')?.cursorMs).toBe(RUN_AT);
      expect(repo.linkOf('mono-card')?.paging).toBeNull();

      // And the next run plans from the cursor, as it always has.
      clockMs = RUN_AT + 3_600_000;
      const second = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });
      await syncLinkedAccounts(portsWith(second.fetchImpl));

      expect(second.statements()[0]).toContain(`/${Math.floor(RUN_AT / 1000)}/`);
    });
  });

  it('A window the API cannot be asked about more precisely is finished, not repeated forever', async () => {
    // 500 items inside one second: `continueWindow` can narrow no further, which `sync.ts`
    // documents as truncation preferable to a sync that never ends. The window has to be
    // declared finished all the same — otherwise the cursor never moves and every later run
    // re-reads the same page.
    link('mono-card', 'card');
    // All of them in the window's own final second, so narrowing would repeat the same request.
    const sameSecond = Array.from({ length: STATEMENT_PAGE_SIZE }, (_, index) =>
      item({
        id: `s${index}`,
        timeSeconds: Math.floor(RUN_AT / 1000),
        description: 'Покупка',
        amount: -100,
      }),
    );
    const first = scriptedFetch({ statement: () => ({ status: 200, body: sameSecond }) });

    const run = ran(await syncLinkedAccounts(portsWith(first.fetchImpl)));

    expect(run.accounts[0]?.outcome).toBe('complete');
    expect(first.statements()).toHaveLength(1);
    // The page is stored and the window is behind us: the cursor is the run's end.
    expect(txs.listAll()).toHaveLength(STATEMENT_PAGE_SIZE);
    expect(repo.linkOf('mono-card')?.cursorMs).toBe(RUN_AT);

    // A later run therefore starts after it, instead of reading the same 500 items again.
    clockMs = RUN_AT + 3_600_000;
    const second = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });
    const later = ran(await syncLinkedAccounts(portsWith(second.fetchImpl)));

    expect(later.imported).toBe(0);
    expect(txs.listAll()).toHaveLength(STATEMENT_PAGE_SIZE);
  });

  it('The committed баланс банку is stamped with when it was obtained, not when it was written', async () => {
    link('mono-card', 'card');
    const { fetchImpl } = scriptedFetch({
      statement: () => ({
        status: 200,
        body: [item({ id: 'a1', timeSeconds: AUGUST_28, description: 'СІЛЬПО', amount: -12550 })],
      }),
    });

    await syncLinkedAccounts(portsWith(fetchImpl));

    // client-info was answered at RUN_AT; the statement page was committed a paced second later,
    // and the balance still carries the moment it was actually obtained.
    expect(repo.getAccount('mono-card')?.obtainedAt).toEqual(new Date(RUN_AT));
    expect(clockMs).toBeGreaterThan(RUN_AT);
  });

  it('Scenario: Refreshing the bank balance changes no transaction', async () => {
    link('mono-card', 'card');
    const { fetchImpl } = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });

    await syncLinkedAccounts(portsWith(fetchImpl));

    // client-info said 990 000 minor units and no credit limit; that becomes the latest баланс
    // банку, in UAH, without a транзакція being created for the difference.
    expect(repo.getAccount('mono-card')?.bankBalance).toEqual(money(990_000, 'UAH'));
    expect(txs.listAll()).toEqual([]);
    expect(computeBalance(card, txs.listByAccount('card'))).toEqual(money(10_000_00, 'UAH'));
  });

  it('Scenario: An API failure leaves the cursor retryable', async () => {
    link('mono-card', 'card');
    const { fetchImpl } = scriptedFetch({ statement: () => ({ status: 429, body: {} }) });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    expect(run.accounts).toEqual([
      { monobankAccountId: 'mono-card', accountId: 'card', outcome: 'rate-limited', imported: 0 },
    ]);
    expect(repo.linkOf('mono-card')?.cursorMs).toBe(boundary);
    expect(repo.importedIds('mono-card')).toEqual(new Set());
  });

  it("A completed account is dated with the moment of the answer its run covered", async () => {
    link('mono-card', 'card');
    const { fetchImpl } = scriptedFetch({
      statement: () => ({
        status: 200,
        body: [item({ id: 'a1', timeSeconds: AUGUST_28, description: 'СІЛЬПО', amount: -12550 })],
      }),
    });

    // Nothing has synced yet — the state of a link the owner has only just made.
    expect(repo.linkOf('mono-card')?.lastSyncedAtMs).toBeNull();

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    expect(run.accounts[0]?.outcome).toBe('complete');
    // Dated by the client-info answer the run covered, not by the clock when it happened to
    // finish: a sync is as recent as the span it reached, and the pages committed beside it carry
    // that same moment. Here the answer was fetched, so it is the run's own start to within the
    // round trip — and, unlike the clock, it does not include the minute the run then waited.
    // Asserted absolutely, not against a value this same run wrote: the answer is fetched before
    // the run's only wait, so its moment is `RUN_AT` exactly — and the clock at the end is not.
    expect(repo.linkOf('mono-card')?.lastSyncedAtMs).toBe(RUN_AT);
    expect(clockMs).toBeGreaterThan(RUN_AT);
  });

  it('Scenario: A failed run leaves the moment alone', async () => {
    link('mono-card', 'card');
    // Yesterday's completed sync, as the device would hold it.
    const yesterday = new Date(RUN_AT - 86_400_000);
    repo.markSynced('mono-card', yesterday);
    const { fetchImpl } = scriptedFetch({ statement: () => ({ status: 429, body: {} }) });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    expect(run.accounts[0]?.outcome).toBe('rate-limited');
    // Still yesterday: a run that did not finish must not date a sync that did not happen.
    expect(repo.linkOf('mono-card')?.lastSyncedAtMs).toBe(yesterday.getTime());
  });

  it('An invalid token, an unavailable bank and a cancelled account all leave the moment alone', async () => {
    link('mono-card', 'card');
    const yesterday = new Date(RUN_AT - 86_400_000);
    repo.markSynced('mono-card', yesterday);
    // 401 on client-info: the whole run stops, and no account is dated.
    const { fetchImpl } = scriptedFetch({ clientInfo: () => ({ status: 401, body: {} }) });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    expect(run.accounts[0]?.outcome).toBe('invalid-token');
    expect(repo.linkOf('mono-card')?.lastSyncedAtMs).toBe(yesterday.getTime());
  });

  it('Scenario: A partial run keeps its truth', async () => {
    link('mono-card', 'card');
    repo.upsertAccounts(
      [
        {
          id: 'mono-white',
          kind: 'card',
          name: 'white ··9999',
          currency: 'UAH',
          bankBalance: money(15_000, 'UAH'),
        },
      ],
      NO_FRESH_ANSWER,
    );
    link('mono-white', 'jar');
    const { fetchImpl } = scriptedFetch({
      statement: (url) =>
        url.includes('mono-card')
          ? {
              status: 200,
              body: [
                item({ id: 'a1', timeSeconds: AUGUST_28, description: 'СІЛЬПО', amount: -12550 }),
                item({ id: 'a2', timeSeconds: AUGUST_28 + 60, description: 'Uklon', amount: -8900 }),
              ],
            }
          : { status: 429, body: {} },
    });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    // The first card is complete with its two транзакції stored…
    expect(run.accounts[0]).toEqual({
      monobankAccountId: 'mono-card',
      accountId: 'card',
      outcome: 'complete',
      imported: 2,
    });
    expect(txs.listByAccount('card')).toHaveLength(2);
    expect(repo.linkOf('mono-card')?.cursorMs).toBe(RUN_AT);
    // …and the second is rate-limited, with nothing advanced, so a retry resumes from the same place.
    expect(run.accounts[1]?.outcome).toBe('rate-limited');
    expect(repo.linkOf('mono-white')?.cursorMs).toBe(boundary);
    expect(run.imported).toBe(2);
  });

  it('Scenario: A row naming another currency does not fail the window — at run level', async () => {
    // The shape `platinum ··6628` answered with, and the whole cost of the defect: before this
    // change the run ended `unavailable`, imported nothing and left the cursor where it was, for
    // ever, because the cause was deterministic. Now the window reads and the рахунок moves on.
    link('mono-card', 'card');
    const { fetchImpl } = scriptedFetch({
      statement: () => ({
        status: 200,
        body: [
          item({ id: 'a1', timeSeconds: AUGUST_28, description: 'СІЛЬПО', amount: -12550 }),
          {
            ...item({ id: 'a2', timeSeconds: AUGUST_28, description: 'AMZN Mktp', amount: -420000 }),
            currencyCode: 840,
            operationAmount: -10000,
          },
        ],
      }),
    });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    expect(run.accounts[0]?.outcome).toBe('complete');
    expect(run.accounts[0]?.reason).toBeUndefined();
    // Both транзакції land, both in the рахунок's own currency — the сума the bank charged.
    expect(txs.listByAccount('card')).toHaveLength(2);
    expect(txs.listByAccount('card')).toMatchObject([
      { type: 'expense', amount: money(12550, 'UAH') },
      { type: 'expense', amount: money(420000, 'UAH') },
    ]);
    // And the cursor advances, which is what had been frozen since the рахунок was linked.
    expect(repo.linkOf('mono-card')?.cursorMs).toBe(RUN_AT);
  });

  it('Scenario: An unreadable statement row is unavailable with the generic reason', async () => {
    link('mono-card', 'card');
    const { fetchImpl } = scriptedFetch({
      statement: () => ({
        status: 200,
        body: [
          { ...item({ id: 'a1', timeSeconds: AUGUST_28, description: 'СІЛЬПО', amount: -12550 }), id: undefined },
        ],
      }),
    });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    expect(run.accounts[0]?.outcome).toBe('unavailable');
    expect(run.accounts[0]?.reason).toBe('unreadable-payload');
  });

  it('A client-info payload the app cannot read repeats its reason across every linked рахунок', async () => {
    link('mono-card', 'card');
    repo.upsertAccounts(
      [
        {
          id: 'mono-white',
          kind: 'card',
          name: 'white ··9999',
          currency: 'UAH',
          bankBalance: money(15_000, 'UAH'),
        },
      ],
      NO_FRESH_ANSWER,
    );
    link('mono-white', 'jar');
    const { fetchImpl } = scriptedFetch({ clientInfo: () => ({ status: 200, body: { accounts: 'nope' } }) });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    expect(run.accounts.map((a) => a.outcome)).toEqual(['unavailable', 'unavailable']);
    // Repeats, does not crash or diverge — accepted per design.md's Non-Goals.
    expect(run.accounts.map((a) => a.reason)).toEqual(['unreadable-payload', 'unreadable-payload']);
    expect(JSON.stringify(run)).not.toContain(TOKEN);
  });

  it('Scenario: A failed commit advances nothing', async () => {
    link('mono-card', 'card');
    const { fetchImpl } = scriptedFetch({
      statement: () => ({
        status: 200,
        body: [item({ id: 'a1', timeSeconds: AUGUST_28, description: 'СІЛЬПО', amount: -12550 })],
      }),
    });
    // A правило pointing at a категорія no row has: the foreign key refuses the транзакція, so
    // the whole answer rolls back.
    const brokenRule: Rule = {
      id: 'r1',
      merchant: 'сільпо',
      target: { kind: 'category', categoryId: 'no-such-category' },
      createdAt: new Date(RUN_AT - 1000),
    };

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl, {}, undefined, [brokenRule])));

    expect(run.accounts[0]?.outcome).toBe('unavailable');
    expect(run.imported).toBe(0);
    expect(txs.listAll()).toEqual([]);
    expect(repo.importedIds('mono-card')).toEqual(new Set());
    expect(repo.linkOf('mono-card')?.cursorMs).toBe(boundary);
    // The balance is the one the run's own client-info answer wrote before any statement was
    // asked for — a successful refresh of its own. The failed answer added nothing to it.
    expect(repo.getAccount('mono-card')?.bankBalance).toEqual(money(990_000, 'UAH'));
  });

  it('Scenario: An invalid stored token asks for replacement', async () => {
    link('mono-card', 'card');
    repo.upsertAccounts(
      [
        {
          id: 'mono-white',
          kind: 'card',
          name: 'white ··9999',
          currency: 'UAH',
          bankBalance: money(15_000, 'UAH'),
        },
      ],
      NO_FRESH_ANSWER,
    );
    link('mono-white', 'jar');
    const { fetchImpl, tokens } = scriptedFetch({ clientInfo: () => ({ status: 401, body: {} }) });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    // Both accounts identify invalid-token, nothing is imported…
    expect(run.accounts.map((a) => a.outcome)).toEqual(['invalid-token', 'invalid-token']);
    expect(run.imported).toBe(0);
    expect(txs.listAll()).toEqual([]);
    // …and the rejected secret was offered exactly once, not again per account.
    expect(tokens).toEqual([TOKEN]);
    // Nothing the screen can render carries it.
    expect(JSON.stringify({ run, progress })).not.toContain(TOKEN);
  });

  it('An invalid token mid-run stops the remaining accounts without asking again', async () => {
    link('mono-card', 'card');
    repo.upsertAccounts(
      [
        {
          id: 'mono-white',
          kind: 'card',
          name: 'white ··9999',
          currency: 'UAH',
          bankBalance: money(15_000, 'UAH'),
        },
      ],
      NO_FRESH_ANSWER,
    );
    link('mono-white', 'jar');
    const { fetchImpl, statements } = scriptedFetch({
      statement: (url) => (url.includes('mono-card') ? { status: 403, body: {} } : { status: 200, body: [] }),
    });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    expect(run.accounts.map((a) => a.outcome)).toEqual(['invalid-token', 'invalid-token']);
    // One statement request, for the account that failed; the second was never asked. Which of
    // the two goes first is `syncOrder`'s tie-break — neither has had a turn, so it is the
    // monobank account id, `mono-card` before `mono-white` («Accounts that have waited equally
    // are ordered reproducibly»).
    expect(statements()).toHaveLength(1);
  });

  it('Requests are paced, and the waiting is visible', async () => {
    link('mono-card', 'card');
    const { fetchImpl } = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });

    await syncLinkedAccounts(portsWith(fetchImpl));

    // client-info goes first with no wait; the statement request waits out the gap.
    expect(waits).toEqual([1_000]);
    expect(progress.filter((p) => p.kind === 'waiting')).toEqual([{ kind: 'waiting', ms: 1_000 }]);
  });

  /**
   * `n` рахунки, `n` monobank accounts and `n` links, plus the client-info body that shows them
   * all — what a phone with more than a couple of cards actually looks like, and the only shape in
   * which the order a run works in can be seen at all.
   */
  function manyLinks(n: number): { clientInfo: () => { status: number; body: unknown } } {
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < n; i += 1) {
      const id = `mono-${i}`;
      const accountId = `acc-${i}`;
      accountsRepo(storage.db).save(
        account({ id: accountId, name: `картка ${i}`, kind: 'spending', currency: 'UAH' }),
      );
      repo.upsertAccounts(
        [{ id, kind: 'card', name: `card ${i}`, currency: 'UAH', bankBalance: money(0, 'UAH') }],
        NO_FRESH_ANSWER,
      );
      link(id, accountId);
      rows.push({
        id,
        currencyCode: 980,
        balance: 0,
        creditLimit: 0,
        maskedPan: [`53754100000000${i}`],
        type: 'black',
      });
    }
    return {
      clientInfo: () => ({
        status: 200,
        body: { clientId: 'x', name: 'Власник', accounts: rows, jars: [] },
      }),
    };
  }

  /** Which monobank account each statement request in `calls` was about, in order. */
  const asked = (statements: readonly string[]): string[] =>
    statements.map((url) => url.split('/statement/')[1]!.split('/')[0]!);

  it('Scenario: A run cut short leaves different accounts first next time', async () => {
    const { clientInfo } = manyLinks(9);
    const first = scriptedFetch({ clientInfo, statement: () => ({ status: 200, body: [] }) });

    // The owner leaves after three рахунки — nine of them need nine minutes of the app being
    // open, which is the whole of the reported bug.
    await syncLinkedAccounts(
      portsWith(first.fetchImpl, { cancelled: () => first.statements().length >= 3 }),
    );
    const firstThree = asked(first.statements());
    expect(firstThree).toEqual(['mono-0', 'mono-1', 'mono-2']);

    const second = scriptedFetch({ clientInfo, statement: () => ({ status: 200, body: [] }) });
    await syncLinkedAccounts(
      portsWith(second.fetchImpl, { cancelled: () => second.statements().length >= 3 }),
    );

    // Not the same three again: the six that have not had a turn go first, so a run cut short
    // over and over still reaches every рахунок instead of looping on a prefix.
    const nextThree = asked(second.statements());
    expect(nextThree).toEqual(['mono-3', 'mono-4', 'mono-5']);
    expect(nextThree.some((id) => firstThree.includes(id))).toBe(false);
  });

  it('Scenario: An account that never completes does not hold the queue', async () => {
    const { clientInfo } = manyLinks(3);
    // `mono-0` is the first of the three and its statement never answers.
    const broken = (url: string) =>
      url.includes('mono-0') ? { status: 500, body: {} } : { status: 200, body: [] };

    const first = scriptedFetch({ clientInfo, statement: broken });
    await syncLinkedAccounts(portsWith(first.fetchImpl, { cancelled: () => first.statements().length >= 1 }));
    expect(asked(first.statements())).toEqual(['mono-0']);

    const second = scriptedFetch({ clientInfo, statement: broken });
    await syncLinkedAccounts(portsWith(second.fetchImpl, { cancelled: () => second.statements().length >= 1 }));

    // Its failed turn still counted as a turn. Ordered on the completed sync instead, `mono-0`
    // would head every run for good and the other two would never be asked about at all.
    expect(asked(second.statements())).toEqual(['mono-1']);
    expect(repo.linkOf('mono-0')?.lastSyncedAtMs).toBeNull();
    expect(repo.linkOf('mono-0')?.lastAttemptedAtMs).not.toBeNull();
  });

  it('Scenario: An account no request is spent on keeps its place', async () => {
    link('mono-card', 'card');
    repo.upsertAccounts(
      [{ id: 'mono-gone', kind: 'card', name: 'gone', currency: 'UAH', bankBalance: money(0, 'UAH') }],
      NO_FRESH_ANSWER,
    );
    link('mono-gone', 'jar');
    // Client-info shows only `mono-card`: the token no longer covers the other one.
    const { fetchImpl, statements } = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    expect(run.accounts.find((a) => a.monobankAccountId === 'mono-gone')?.outcome).toBe('unavailable');
    // Not an `api.ts` answer at all, so it carries no reason (design.md's Non-Goals).
    expect(run.accounts.find((a) => a.monobankAccountId === 'mono-gone')?.reason).toBeUndefined();
    expect(asked(statements())).toEqual(['mono-card']);
    // No request was spent on it, so no turn was taken: it costs nothing to leave at the head of
    // the order, and the next run will pass over it just as cheaply.
    expect(repo.linkOf('mono-gone')?.lastAttemptedAtMs).toBeNull();
  });

  it('Scenario: A run stopped while it waits spends no request and takes no turn', async () => {
    link('mono-card', 'card');
    const { fetchImpl, statements } = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });
    // «Зупинити» pressed while the run sits out the gap before the statement request. A gap is a
    // whole minute, which is long enough to leave the screen.
    const run = ran(
      await syncLinkedAccounts(portsWith(fetchImpl, { cancelled: () => waits.length >= 1 })),
    );

    expect(run.accounts.map((a) => a.outcome)).toEqual(['cancelled']);
    // Not sent: a request after the owner stopped is one nobody asked for, and it would spend the
    // device's one-a-minute budget on it.
    expect(statements()).toHaveLength(0);
    // And no turn was taken, so the next run finds this рахунок exactly where it was in the order.
    expect(repo.linkOf('mono-card')?.lastAttemptedAtMs).toBeNull();
  });

  it('Scenario: The owner\u2019s stop still reads as cancelled', async () => {
    link('mono-card', 'card');
    repo.upsertAccounts(
      [{ id: 'mono-white', kind: 'card', name: 'white', currency: 'UAH', bankBalance: money(0, 'UAH') }],
      NO_FRESH_ANSWER,
    );
    link('mono-white', 'jar');
    const { fetchImpl } = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });

    // Both would answer: the owner pressed «Зупинити» on a run that is also out of the time it was
    // given. Their own decision is the more informative word, so it is the one asked first.
    const run = ran(
      await syncLinkedAccounts(
        portsWith(fetchImpl, {
          cancelled: () => waits.length >= 1,
          postponed: () => waits.length >= 1,
        }),
      ),
    );

    expect(run.accounts.map((a) => a.outcome)).toEqual(['cancelled', 'cancelled']);
    expect(run.accounts.some((a) => a.outcome === 'postponed')).toBe(false);
  });

  it('Scenario: A postponed \u0440\u0430\u0445\u0443\u043d\u043e\u043a moves no moment', async () => {
    link('mono-card', 'card');
    const yesterday = RUN_AT - 86_400_000;
    repo.markSynced('mono-card', new Date(yesterday));
    const { fetchImpl, statements } = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });

    // Out of time while it sits out the gap before the statement request.
    const run = ran(
      await syncLinkedAccounts(portsWith(fetchImpl, { postponed: () => waits.length >= 1 })),
    );

    expect(run.accounts.map((a) => a.outcome)).toEqual(['postponed']);
    expect(statements()).toHaveLength(0);
    // Yesterday's sync is the last one that happened, and a run that did not finish must not date
    // itself as one that did.
    expect(repo.linkOf('mono-card')?.lastSyncedAtMs).toBe(yesterday);
    expect(repo.linkOf('mono-card')?.lastAttemptedAtMs).toBeNull();
  });

  it('Scenario: An answer in flight when the прогін stops is still stored whole', async () => {
    link('mono-card', 'card');
    repo.upsertAccounts(
      [{ id: 'mono-white', kind: 'card', name: 'white', currency: 'UAH', bankBalance: money(0, 'UAH') }],
      NO_FRESH_ANSWER,
    );
    link('mono-white', 'jar');
    const { fetchImpl, statements } = scriptedFetch({
      statement: () => ({
        status: 200,
        body: [item({ id: 'a1', timeSeconds: AUGUST_28, description: 'СІЛЬПО', amount: -12550 })],
      }),
    });

    // Yes from the moment the first statement request goes out — which is while its answer is
    // still being read and stored. The budget is asked before a request and never in the middle
    // of an answer, so that answer is kept whole and only the next request is not sent.
    const run = ran(
      await syncLinkedAccounts(portsWith(fetchImpl, { postponed: () => statements().length >= 1 })),
    );

    expect(run.accounts.map((a) => a.outcome)).toEqual(['complete', 'postponed']);
    expect(run.imported).toBe(1);
    expect(txs.listAll()).toHaveLength(1);
    expect(repo.linkOf('mono-card')?.cursorMs).toBe(RUN_AT);
    expect(statements()).toHaveLength(1);
  });

  it('Scenario: A \u0440\u0430\u0445\u0443\u043d\u043e\u043a stopped between its windows keeps its pages and its turn', async () => {
    // A first sync three windows wide: the boundary is more than two maximum windows back.
    const cursorMs = RUN_AT - (2 * MAX_STATEMENT_WINDOW_MS + 1_000);
    link('mono-card', 'card', cursorMs);
    const windows = planWindows(cursorMs, RUN_AT);
    expect(windows).toHaveLength(3);
    const { fetchImpl, statements } = scriptedFetch({
      statement: (_url, call) => ({
        status: 200,
        body: [
          item({
            id: `w${call}`,
            timeSeconds: AUGUST_28 + call,
            description: 'СІЛЬПО',
            amount: -1_000,
          }),
        ],
      }),
    });

    const run = ran(
      await syncLinkedAccounts(portsWith(fetchImpl, { postponed: () => statements().length >= 2 })),
    );

    expect(run.accounts.map((a) => a.outcome)).toEqual(['postponed']);
    // Two windows committed: their транзакції are stored and the cursor sits at the end of the
    // second, which is exactly where the next run has to continue from.
    expect(run.imported).toBe(2);
    expect(txs.listAll()).toHaveLength(2);
    const stoppedAt = repo.linkOf('mono-card');
    expect(stoppedAt?.cursorMs).toBe(windows[1]!.toMs);
    // The turn its requests took stays taken, so the order ranks it behind whatever has not had
    // one; and its moment does not move, because it did not complete.
    expect(stoppedAt?.lastAttemptedAtMs).not.toBeNull();
    expect(stoppedAt?.lastSyncedAtMs).toBeNull();

    // The next run picks up the third window and finishes it.
    const second = scriptedFetch({
      statement: (url) => {
        expect(url).toContain(`/${Math.floor(windows[1]!.toMs / 1000)}/`);
        return { status: 200, body: [] };
      },
    });
    const next = ran(await syncLinkedAccounts(portsWith(second.fetchImpl)));
    expect(next.accounts.map((a) => a.outcome)).toEqual(['complete']);
  });

  it('Scenario: A \u0440\u0430\u0445\u0443\u043d\u043e\u043a never asked about keeps its place in the order', async () => {
    const { clientInfo } = manyLinks(3);
    const first = scriptedFetch({ clientInfo, statement: () => ({ status: 200, body: [] }) });

    // A background run out of time after one рахунок: the other two are postponed without a
    // request being sent about them.
    const run = ran(
      await syncLinkedAccounts(
        portsWith(first.fetchImpl, { postponed: () => first.statements().length >= 1 }),
      ),
    );
    expect(run.accounts.map((a) => a.outcome)).toEqual(['complete', 'postponed', 'postponed']);
    expect(asked(first.statements())).toEqual(['mono-0']);

    const second = scriptedFetch({ clientInfo, statement: () => ({ status: 200, body: [] }) });
    await syncLinkedAccounts(
      portsWith(second.fetchImpl, { postponed: () => second.statements().length >= 2 }),
    );

    // No turn was taken for either, so both are still at the head of the order and are the first
    // the later run asks the bank about. That is what makes successive background runs work
    // through every linked рахунок instead of looping on the first.
    expect(asked(second.statements())).toEqual(['mono-1', 'mono-2']);
  });

  it('Scenario: Giving an account its turn does not reorder the run it is in', async () => {
    const { clientInfo } = manyLinks(3);
    // Turns that put the order at odds with the account ids: `mono-2` has waited longest and
    // `mono-0` least, so the run goes backwards through them. An expectation of `mono-0` first
    // would pass under the alphabetical sort this replaced; this one cannot.
    repo.noteTurn('mono-0', new Date(RUN_AT - 60_000));
    repo.noteTurn('mono-1', new Date(RUN_AT - 2 * 60_000));
    repo.noteTurn('mono-2', new Date(RUN_AT - 3 * 60_000));
    const { fetchImpl, statements } = scriptedFetch({
      clientInfo,
      statement: () => ({ status: 200, body: [] }),
    });

    await syncLinkedAccounts(portsWith(fetchImpl));

    // The order is taken once, before the first request, and each рахунок is asked about exactly
    // once. Recomputed after each account, a рахунок that had just had its turn would sort to the
    // back of the run's own queue and the loop would be a priority queue over state it is
    // mutating — a run over N accounts could then not be said to make N requests.
    expect(asked(statements())).toEqual(['mono-2', 'mono-1', 'mono-0']);
  });

  it('Scenario: The first run on a device does not wait', async () => {
    link('mono-card', 'card');
    const { fetchImpl } = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });

    await syncLinkedAccounts(portsWith(fetchImpl));

    // One wait, for the statement request — the client-info request went out at once, because
    // this device had never sent one.
    expect(waits).toEqual([1_000]);
  });

  it('Scenario: A run started immediately after another waits', async () => {
    link('mono-card', 'card');
    // The previous run's last request, a moment ago — a pull-to-refresh right after a sync ends.
    repo.noteRequest(new Date(clockMs));
    const { fetchImpl } = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });

    await syncLinkedAccounts(portsWith(fetchImpl));

    // The client-info request waits too, instead of firing at once and being refused with a 429
    // that would be remembered as rate-limited on every рахунок of the run.
    expect(waits).toEqual([1_000, 1_000]);
    // And the wait is announced before anything else happens, so a screen watching the run can
    // say a sync is going on rather than looking frozen — main-screen's «A pull that must wait
    // out the request gap says a sync is going on».
    expect(progress[0]).toEqual({ kind: 'started', accounts: 1 });
    expect(progress[1]).toEqual({ kind: 'waiting', ms: 1_000 });
  });

  it('Scenario: A run started long after another does not wait', async () => {
    link('mono-card', 'card');
    repo.noteRequest(new Date(clockMs - 5_000));
    const { fetchImpl } = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });

    await syncLinkedAccounts(portsWith(fetchImpl));

    expect(waits).toEqual([1_000]);
  });

  it('Scenario: A clock moved forward does not stall sync', async () => {
    link('mono-card', 'card');
    // A moment a year in the future: an NTP correction, or a clock set by hand.
    repo.noteRequest(new Date(clockMs + 365 * 24 * 60 * 60 * 1_000));
    const { fetchImpl } = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });

    await syncLinkedAccounts(portsWith(fetchImpl));

    // One gap, not a year. Waiting out the difference would disable sync until the phone's own
    // clock caught up, which for a year-ahead clock is forever.
    expect(waits).toEqual([1_000, 1_000]);
  });

  it('Scenario: A failed run still moves the remembered moment', async () => {
    link('mono-card', 'card');
    const { fetchImpl } = scriptedFetch({ statement: () => ({ status: 429, body: {} }) });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    expect(run.accounts.map((a) => a.outcome)).toEqual(['rate-limited']);
    // A request that came back 429 was still sent, so the next run paces itself from it.
    expect(repo.lastRequestAtMs()).toBe(clockMs);
  });

  it('Scenario: Storage that will not remember the moment does not stop the run', async () => {
    link('mono-card', 'card');
    const refusing = {
      ...repo,
      lastRequestAtMs: () => {
        throw new Error('storage');
      },
      noteRequest: () => {
        throw new Error('storage');
      },
      noteTurn: () => {
        throw new Error('storage');
      },
    };
    const { fetchImpl } = scriptedFetch({
      statement: () => ({
        status: 200,
        body: [item({ id: 'a1', timeSeconds: 1787900000, description: 'СІЛЬПО', amount: -12_550 })],
      }),
    });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl, { storage: refusing })));

    // The run imported what it could. A write whose only job is to make the *next* run better
    // paced must never cost this one.
    expect(run.accounts.map((a) => a.outcome)).toEqual(['complete']);
    expect(run.imported).toBe(1);
  });

  it('Cancelling stops the run and leaves every unfinished account retryable', async () => {
    link('mono-card', 'card');
    repo.upsertAccounts(
      [
        {
          id: 'mono-white',
          kind: 'card',
          name: 'white ··9999',
          currency: 'UAH',
          bankBalance: money(15_000, 'UAH'),
        },
      ],
      NO_FRESH_ANSWER,
    );
    link('mono-white', 'jar');
    const { fetchImpl, statements } = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });
    let stop = false;
    const ports = portsWith(fetchImpl, { cancelled: () => stop });
    // Stop as soon as the first account has finished. Which one that is comes from `syncOrder`'s
    // tie-break — neither link has had a turn, so it is the monobank account id.
    
    const watching: SyncPorts = {
      ...ports,
      onProgress: (event) => {
        progress.push(event);
        if (event.kind === 'finished-account') {
          stop = true;
        }
      },
    };

    const run = ran(await syncLinkedAccounts(watching));

    expect(run.accounts.map((a) => a.outcome)).toEqual(['complete', 'cancelled']);
    expect(statements()).toHaveLength(1);
    expect(repo.linkOf('mono-white')?.cursorMs).toBe(boundary);
  });

  it('An unlinked monobank account takes no part in sync', async () => {
    // `mono-white` exists on the token and is not linked; nothing is ever asked about it.
    link('mono-card', 'card');
    const { fetchImpl, statements } = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    expect(run.accounts.map((a) => a.monobankAccountId)).toEqual(['mono-card']);
    expect(statements().every((url) => url.includes('mono-card'))).toBe(true);
  });

  it('A linked account the token no longer shows is unavailable, and loses nothing', async () => {
    link('mono-card', 'card');
    repo.commitStatementAnswer({
      monobankAccountId: 'mono-card',
      transactions: [],
      newlySeenIds: ['old-item'],
      bankBalance: money(1_000_000, 'UAH'),
      obtainedAt: NO_FRESH_ANSWER,
      cursorMs: boundary,
      storedAt: new Date(RUN_AT - 1000),
    });
    const { fetchImpl, statements } = scriptedFetch({
      clientInfo: () => ({ status: 200, body: { ...CLIENT_INFO, accounts: [] } }),
    });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    expect(run.accounts[0]?.outcome).toBe('unavailable');
    expect(run.accounts[0]?.reason).toBeUndefined();
    expect(statements()).toEqual([]);
    // The link, the cursor and the imported ids are all still there.
    expect(repo.linkOf('mono-card')?.cursorMs).toBe(boundary);
    expect(repo.importedIds('mono-card')).toEqual(new Set(['old-item']));
  });

  it('A run without a token or without links does nothing at all', async () => {
    const { fetchImpl, calls } = scriptedFetch({});

    expect(await syncLinkedAccounts(portsWith(fetchImpl, {}, inMemoryMonobankTokenStore()))).toEqual({
      kind: 'not-configured',
    });
    expect(
      await syncLinkedAccounts(
        portsWith(fetchImpl, {}, inMemoryMonobankTokenStore({ token: TOKEN, unavailable: true })),
      ),
    ).toEqual({ kind: 'storage-unavailable' });
    // A configured token with nothing linked: no request either.
    expect(await syncLinkedAccounts(portsWith(fetchImpl))).toEqual({ kind: 'no-links' });
    expect(calls).toEqual([]);
  });

  describe('the client-info request a run need not send', () => {
    /** Stores a client-info answer of this phone's own, `agoMs` before the run starts. */
    const remember = (agoMs: number, ids: readonly string[] = ['mono-card', 'mono-white']) =>
      repo.upsertAccounts(
        ids.map((id) => ({
          id,
          kind: 'card' as const,
          name: `card ${id}`,
          currency: 'UAH' as const,
          bankBalance: money(1_234_00, 'UAH'),
        })),
        new Date(RUN_AT - agoMs),
      );

    const clientInfoCalls = (calls: readonly string[]) =>
      calls.filter((u) => u.includes('/client-info')).length;

    it('Scenario: A fresh stored answer sends the allowance to the statement', async () => {
      remember(10 * 60_000);
      link('mono-card', 'card');
      link('mono-white', 'jar');
      // The gap is long past, so nothing is owed and the run may send at once.
      repo.noteRequest(new Date(RUN_AT - 60 * 60_000));
      const script = scriptedFetch({});

      const run = ran(await syncLinkedAccounts(portsWith(script.fetchImpl)));

      // The one request a run of this shape can afford went to the statement, which is the request
      // that imports. This is the whole defect: before, it went to client-info and imported nothing.
      expect(clientInfoCalls(script.calls)).toBe(0);
      expect(script.calls[0]).toContain('/statement/');
      expect(run.accounts.every((a) => a.outcome === 'complete')).toBe(true);
    });

    it('Scenario: «Синхронізувати» asks the bank however fresh the stored answer is', async () => {
      link('mono-card', 'card');
      remember(10 * 60_000);
      repo.noteRequest(new Date(RUN_AT - 60 * 60_000));
      const script = scriptedFetch({});

      // The pull on Головний and «Синхронізувати» are the two the app already calls «asked for»;
      // both are the owner saying «now», and both may spend a request on saying it.
      await syncLinkedAccounts(portsWith(script.fetchImpl, { asked: true }));

      expect(clientInfoCalls(script.calls)).toBe(1);
      expect(script.calls[0]).toContain('/client-info');
    });

    it('Scenario: A прогін an opening starts uses the stored answer', async () => {
      link('mono-card', 'card');
      remember(10 * 60_000);
      repo.noteRequest(new Date(RUN_AT - 60 * 60_000));
      const script = scriptedFetch({});

      // The same ports without `asked`: an opening, a foreground return, the follow-up, a chance.
      await syncLinkedAccounts(portsWith(script.fetchImpl));

      expect(clientInfoCalls(script.calls)).toBe(0);
    });

    it('Scenario: An answer older than the межа свіжості is refetched', async () => {
      link('mono-card', 'card');
      remember(2 * 60 * 60_000);
      repo.noteRequest(new Date(RUN_AT - 60 * 60_000));
      const script = scriptedFetch({});

      await syncLinkedAccounts(portsWith(script.fetchImpl));

      expect(clientInfoCalls(script.calls)).toBe(1);
    });

    it('Scenario: A link the token no longer names does not send every прогін back to client-info', async () => {
      // The newest answer names one рахунок; the other keeps a row no answer will ever refresh,
      // which is what a revoked card leaves behind — `upsertAccounts` never deletes.
      remember(3 * 60 * 60_000, ['mono-white']);
      remember(10 * 60_000, ['mono-card']);
      link('mono-card', 'card');
      link('mono-white', 'jar');
      repo.noteRequest(new Date(RUN_AT - 60 * 60_000));
      const script = scriptedFetch({});

      const run = ran(await syncLinkedAccounts(portsWith(script.fetchImpl)));

      // No client-info request: the stale row is «the token no longer shows this рахунок», the
      // same verdict a fetched answer gives it — never a reason to ask again, or the run would
      // spend its allowance on client-info for ever and import nothing.
      expect(clientInfoCalls(script.calls)).toBe(0);
      const white = run.accounts.find((a) => a.monobankAccountId === 'mono-white');
      expect(white?.outcome).toBe('unavailable');
      // And nothing of that рахунок moved.
      expect(repo.linkOf('mono-white')?.cursorMs).toBe(boundary);
      expect(repo.linkOf('mono-white')?.lastAttemptedAtMs).toBeNull();
    });

    it('Scenario: A прогін that refetches leaves the next one able to send a statement', async () => {
      link('mono-card', 'card');
      // Nothing stored inside the bound, and the gap owed at once: the first run may send exactly
      // its client-info request and stops there.
      repo.noteRequest(new Date(RUN_AT - 60 * 60_000));
      const script = scriptedFetch({});

      // Postponed the moment the first request is spent: this run affords client-info and no more,
      // which is exactly the shape of a chance on a phone that has been away for a while.
      await syncLinkedAccounts(
        portsWith(script.fetchImpl, { postponed: () => script.calls.length > 0 }),
      );
      expect(clientInfoCalls(script.calls)).toBe(1);
      expect(script.statements()).toEqual([]);

      // The convergence hinge: the answer was stored before the run stopped, so the run after it
      // sends a statement request instead of buying the same balances again.
      const second = scriptedFetch({});
      await syncLinkedAccounts(portsWith(second.fetchImpl));

      expect(clientInfoCalls(second.calls)).toBe(0);
      expect(second.calls[0]).toContain('/statement/');
    });

    it('Scenario: A прогін that may send one request imports with it', async () => {
      remember(10 * 60_000);
      link('mono-card', 'card');
      link('mono-white', 'jar');
      repo.noteRequest(new Date(RUN_AT - 60 * 60_000));
      const script = scriptedFetch({
        statement: () => ({
          status: 200,
          body: [item({ id: 'a1', timeSeconds: AUGUST_28, description: 'СІЛЬПО', amount: -12_550 })],
        }),
      });
      // A run that may send exactly one request: the second is a wait it will not sit out.
      let sent = 0;
      const run = ran(
        await syncLinkedAccounts(
          portsWith(script.fetchImpl, {
            wait: () => {
              sent += 1;
              return Promise.resolve();
            },
            postponed: () => sent > 0,
          }),
        ),
      );

      expect(run.imported).toBe(1);
      expect(script.statements()).toHaveLength(1);
      // The рахунок it asked about took its хід, so the next run starts with the other one.
      expect(repo.linkOf('mono-card')?.lastAttemptedAtMs).not.toBeNull();
      expect(repo.linkOf('mono-white')?.lastAttemptedAtMs).toBeNull();
    });

    it('Scenario: Storage that will not answer does not stop the прогін', async () => {
      link('mono-card', 'card');
      remember(10 * 60_000);
      const refusing = {
        ...repo,
        rememberedAccounts: () => {
          throw new Error('storage');
        },
      };
      const script = scriptedFetch({});

      const run = ran(await syncLinkedAccounts(portsWith(script.fetchImpl, { storage: refusing })));

      // A read whose only job is to spare a request must never cost the run.
      expect(clientInfoCalls(script.calls)).toBe(1);
      expect(run.accounts.map((a) => a.outcome)).toEqual(['complete']);
    });

    it('Scenario: A прогін using a stored answer imports only up to that answer\'s moment', async () => {
      remember(40 * 60_000);
      link('mono-card', 'card');
      repo.noteRequest(new Date(RUN_AT - 60 * 60_000));
      const answerMs = RUN_AT - 40 * 60_000;
      const script = scriptedFetch({
        statement: (url) => ({
          status: 200,
          // The bank answers whatever the window asked for; the window is what is under test.
          body: [
            item({
              id: 'inside',
              timeSeconds: Math.floor((answerMs - 60_000) / 1000),
              description: 'СІЛЬПО',
              amount: -1_000,
            }),
          ].concat(
            url.includes('/statement/') && Number(url.split('/').pop()) * 1000 > answerMs
              ? [
                  item({
                    id: 'after',
                    timeSeconds: Math.floor((answerMs + 10 * 60_000) / 1000),
                    description: 'ПІЗНІШЕ',
                    amount: -2_000,
                  }),
                ]
              : [],
          ),
        }),
      });

      const run = ran(await syncLinkedAccounts(portsWith(script.fetchImpl)));

      // The баланс банку committed with these pages is forty minutes old, so the транзакції beside
      // it must be too: a рахунок carrying an hour of spending the balance has not seen would make
      // «Звірити» offer a коригування for money already explained.
      const askedTo = Number(script.statements()[0]!.split('/').pop());
      expect(askedTo * 1000).toBeLessThanOrEqual(answerMs);
      expect(repo.linkOf('mono-card')?.cursorMs).toBe(answerMs);
      expect(run.imported).toBe(1);
    });

    it('Scenario: The next прогін imports the rest', async () => {
      remember(40 * 60_000);
      link('mono-card', 'card');
      repo.noteRequest(new Date(RUN_AT - 60 * 60_000));
      await syncLinkedAccounts(portsWith(scriptedFetch({}).fetchImpl));
      expect(repo.linkOf('mono-card')?.cursorMs).toBe(RUN_AT - 40 * 60_000);

      // A прогін with an answer of its own carries the cursor to that answer's moment.
      clockMs = RUN_AT + 60_000;
      const second = scriptedFetch({});
      await syncLinkedAccounts(portsWith(second.fetchImpl, { asked: true }));

      // The answer this run fetched, not the clock after it waited out the gap.
      expect(repo.linkOf('mono-card')?.cursorMs).toBe(RUN_AT + 60_000);
    });

    it('Scenario: A committed баланс банку carries the age of the answer it came from', async () => {
      remember(40 * 60_000);
      link('mono-card', 'card');
      repo.noteRequest(new Date(RUN_AT - 60 * 60_000));

      await syncLinkedAccounts(
        portsWith(
          scriptedFetch({
            statement: () => ({
              status: 200,
              body: [item({ id: 'a1', timeSeconds: AUGUST_28, description: 'x', amount: -100 })],
            }),
          }).fetchImpl,
        ),
      );

      // Dated when the answer was obtained, never when the page happened to be committed.
      expect(repo.getAccount('mono-card')?.obtainedAt).toEqual(new Date(RUN_AT - 40 * 60_000));
    });

    it('Scenario: A completed рахунок is remembered by the answer\'s moment', async () => {
      remember(40 * 60_000);
      link('mono-card', 'card');
      repo.noteRequest(new Date(RUN_AT - 60 * 60_000));

      await syncLinkedAccounts(portsWith(scriptedFetch({}).fetchImpl));

      // Not «now»: a sync is as recent as the answer it covered, and saying otherwise would date a
      // синхронізація over a span the bank was never asked about.
      expect(repo.linkOf('mono-card')?.lastSyncedAtMs).toBe(RUN_AT - 40 * 60_000);
    });

    it('Scenario: A прогін with nothing to ask moves no moment', async () => {
      remember(40 * 60_000);
      link('mono-card', 'card');
      repo.noteRequest(new Date(RUN_AT - 60 * 60_000));
      await syncLinkedAccounts(portsWith(scriptedFetch({}).fetchImpl));
      const synced = repo.linkOf('mono-card')?.lastSyncedAtMs;
      const turn = repo.linkOf('mono-card')?.lastAttemptedAtMs;

      // A second прогін inside the межа свіжості: every cursor already stands at the answer's
      // moment, so there is nothing to ask the bank about.
      clockMs = RUN_AT + 5 * 60_000;
      const second = scriptedFetch({});
      const run = ran(await syncLinkedAccounts(portsWith(second.fetchImpl)));

      expect(second.calls).toEqual([]);
      expect(run.accounts.map((a) => a.outcome)).toEqual(['complete']);
      // Nothing was asked, so nothing moved: a sync the bank was never asked about is not a sync.
      expect(repo.linkOf('mono-card')?.lastSyncedAtMs).toBe(synced);
      expect(repo.linkOf('mono-card')?.lastAttemptedAtMs).toBe(turn);
    });

    it('Scenario: A stored answer older than a рахунок the owner has just linked is refetched', async () => {
      // Linked with a boundary after the stored answer's moment. Working from that answer would
      // leave this рахунок with nothing to ask about and nothing to report but «finished without
      // asking» — while the screen goes on saying «Ще не синхронізовано», because nothing was. And
      // it could not be called перенесено either: `followUpDue` starts a run at once on that word,
      // and a run that could only report the same thing again would follow itself for as long as
      // the app stayed open.
      remember(40 * 60_000);
      repo.link({
        monobankAccountId: 'mono-card',
        accountId: 'card',
        syncStartDate: '2026-08-27',
        cursorMs: RUN_AT - 10 * 60_000,
      });
      repo.noteRequest(new Date(RUN_AT - 60 * 60_000));
      const script = scriptedFetch({});

      const run = ran(await syncLinkedAccounts(portsWith(script.fetchImpl)));

      // One request spent on client-info, and it heals the рахунок: the answer is dated now, past
      // the boundary the owner set, so the very next window is one the bank can be asked about.
      expect(clientInfoCalls(script.calls)).toBe(1);
      expect(run.accounts.map((a) => a.outcome)).toEqual(['complete']);
      expect(repo.linkOf('mono-card')?.lastSyncedAtMs).not.toBeNull();
    });

    it('A run that ends complete is not followed by another', async () => {
      // The loop `followUpDue` must never allow: `worstOutcome` ranks postponed above complete and
      // `followUpDue` starts a run at once on postponed, so a run that sent nothing and could only
      // send nothing again must not carry that word. Two runs in sequence, and the second is the
      // ordinary «nothing left to ask» run rather than a repeat of a postponement.
      remember(40 * 60_000);
      link('mono-card', 'card');
      repo.noteRequest(new Date(RUN_AT - 60 * 60_000));
      await syncLinkedAccounts(portsWith(scriptedFetch({}).fetchImpl));

      clockMs = RUN_AT + 60_000;
      const second = scriptedFetch({});
      const run = ran(await syncLinkedAccounts(portsWith(second.fetchImpl)));

      expect(second.calls).toEqual([]);
      expect(run.accounts.map((a) => a.outcome)).toEqual(['complete']);
    });

    it('Scenario: The pace still measures from the request', async () => {
      remember(40 * 60_000);
      link('mono-card', 'card');
      repo.noteRequest(new Date(RUN_AT - 60 * 60_000));

      await syncLinkedAccounts(
        portsWith(
          scriptedFetch({
            statement: () => ({
              status: 200,
              body: [item({ id: 'a1', timeSeconds: AUGUST_28, description: 'x', amount: -100 })],
            }),
          }).fetchImpl,
        ),
      );

      // The moments of *requests* are read from the clock at the instant they are sent. An
      // answer's moment reaching either would tell the next прогін the last request was forty
      // minutes ago and defeat the pace this whole change exists to spend well.
      expect(repo.lastRequestAtMs()).toBe(clockMs);
      expect(repo.linkOf('mono-card')?.lastAttemptedAtMs).toBe(clockMs);
    });

    it('Scenario: A statement request is not sent seconds after a request the screen made', async () => {
      link('mono-card', 'card');
      remember(10 * 60_000);
      // The monobank screen refreshed a moment ago and noted the request it sent.
      repo.noteRequest(new Date(RUN_AT - 200));
      const script = scriptedFetch({});

      await syncLinkedAccounts(portsWith(script.fetchImpl));

      // The run owes the rest of the gap and waits it out rather than firing into a refusal.
      expect(waits).toEqual([800]);
      expect(script.statements()).toHaveLength(1);
    });
  });
});

/**
 * The default distinctions, held across a real run. Sync applies the mapping and nothing else: it
 * never pairs two rows, never finalises a повернення and never invents a переказ or «Відсотки».
 */
describe('syncLinkedAccounts — what sync deliberately does not decide', () => {
  let storage: TestStorage;
  let repo: MonobankRepo;
  let txs: TransactionsRepo;
  let clockMs: number;
  let ids: number;

  const RUN_AT = Date.UTC(2026, 7, 28, 12, 0, 0);
  const boundary = startOfLocalDayMs('2026-08-27');

  const jarMono = {
    id: 'mono-jar',
    kind: 'jar' as const,
    name: 'На відпустку',
    currency: 'UAH',
    bankBalance: money(300_000, 'UAH'),
  };

  const CLIENT_INFO_WITH_JAR = {
    clientId: '3MSaMMtczs',
    name: 'Власник',
    accounts: [
      {
        id: 'mono-card',
        currencyCode: 980,
        balance: 990_000,
        creditLimit: 0,
        maskedPan: ['537541******1234'],
        type: 'black',
      },
    ],
    jars: [{ id: 'mono-jar', currencyCode: 980, balance: 300_000, title: 'На відпустку' }],
  };

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    accountsRepo(storage.db).save(card);
    accountsRepo(storage.db).save(jarAccount);
    repo = monobankRepo(storage.db);
    txs = transactionsRepo(storage.db);
    repo.upsertAccounts(
      [
        {
          id: 'mono-card',
          kind: 'card',
          name: 'black ··1234',
          currency: 'UAH',
          bankBalance: money(1_000_000, 'UAH'),
        },
        jarMono,
      ],
      new Date(RUN_AT - 1000),
    );
    repo.link({
      monobankAccountId: 'mono-card',
      accountId: 'card',
      syncStartDate: '2026-08-27',
      cursorMs: boundary,
    });
    repo.link({
      monobankAccountId: 'mono-jar',
      accountId: 'jar',
      syncStartDate: '2026-08-27',
      cursorMs: boundary,
    });
    clockMs = RUN_AT;
    ids = 0;
  });

  afterEach(() => {
    storage.close();
  });

  const runWith = (
    statement: (url: string, call: number) => { status: number; body: unknown },
  ): Promise<SyncRun> => {
    const { fetchImpl } = scriptedFetch({
      clientInfo: () => ({ status: 200, body: CLIENT_INFO_WITH_JAR }),
      statement,
    });
    return syncLinkedAccounts({
      tokenStore: inMemoryMonobankTokenStore({ token: TOKEN }),
      fetch: fetchImpl,
      storage: repo,
      rules: () => [],
      nowMs: () => clockMs,
      now: () => new Date(clockMs),
      dateOf,
      wait: async (ms) => {
        clockMs += ms;
      },
      newId: () => `imported-${++ids}`,
      minRequestGapMs: 0,
    });
  };

  it('Scenario: Two own-account legs are not paired automatically', async () => {
    // The same movement, seen from both sides: it leaves the card and arrives in the банка.
    await runWith((url) =>
      url.includes('mono-card')
        ? {
            status: 200,
            body: [item({ id: 'out', timeSeconds: AUGUST_28, description: 'На банку', amount: -100_000 })],
          }
        : {
            status: 200,
            body: [item({ id: 'in', timeSeconds: AUGUST_28, description: 'З картки', amount: 100_000 })],
          },
    );

    const stored = txs.listAll();
    expect(stored).toHaveLength(2);
    // A витрата and a дохід «Без джерела» — no переказ, no інвестиція, nothing paired.
    expect(stored.map((t) => t.type).sort()).toEqual(['expense', 'income']);
    expect(stored.some((t) => t.type === 'transfer')).toBe(false);
    const expense = stored.find((t) => t.type === 'expense') as Expense;
    const income = stored.find((t) => t.type === 'income') as Income;
    expect(expense.categoryId).toBe(UNCATEGORISED_CATEGORY_ID);
    expect(income.sourceId).toBe(UNSOURCED_SOURCE_ID);
  });

  it('Scenario: Cashback is not silently finalised as income', async () => {
    await runWith((url) =>
      url.includes('mono-card')
        ? {
            status: 200,
            body: [item({ id: 'cb', timeSeconds: AUGUST_28, description: 'Кешбек', amount: 1_500 })],
          }
        : { status: 200, body: [] },
    );

    const income = txs.listAll().find((t) => t.type === 'income') as Income;
    // A дохід the owner can retype through витрата into повернення — sync chose no final джерело.
    expect(income.sourceId).toBe(UNSOURCED_SOURCE_ID);
    expect(income.description).toBe('Кешбек');
    expect(txs.listAll().some((t) => t.type === 'refund')).toBe(false);
  });

  it('Scenario: Lending and interest are not inferred', async () => {
    // Money coming back that could be a repayment with interest: one item, one дохід.
    await runWith((url) =>
      url.includes('mono-card')
        ? {
            status: 200,
            body: [
              item({ id: 'repay', timeSeconds: AUGUST_28, description: 'Ярослав', amount: 110_000 }),
            ],
          }
        : { status: 200, body: [] },
    );

    const stored = txs.listAll();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ type: 'income', sourceId: UNSOURCED_SOURCE_ID });
    // No переказ of principal beside it, and no separate дохід «Відсотки».
    expect(stored.some((t) => t.type === 'transfer')).toBe(false);
  });

  it('A hold is imported like any other operation, and a zero item stores nothing', async () => {
    await runWith((url) =>
      url.includes('mono-card')
        ? {
            status: 200,
            body: [
              item({ id: 'h1', timeSeconds: AUGUST_28, description: 'АТБ', amount: -5_000, hold: true }),
              item({ id: 'z1', timeSeconds: AUGUST_28 + 10, description: 'Нуль', amount: 0 }),
            ],
          }
        : { status: 200, body: [] },
    );

    expect(txs.listAll()).toHaveLength(1);
    // The zero item is remembered all the same, so it is not re-examined forever.
    expect(repo.importedIds('mono-card')).toEqual(new Set(['h1', 'z1']));
  });

});
