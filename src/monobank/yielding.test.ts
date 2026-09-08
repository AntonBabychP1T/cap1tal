import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { accountsRepo } from '../db/accounts-repo';
import { monobankRepo, type MonobankRepo } from '../db/monobank-repo';
import { openTestDb, seedReferences, type TestStorage } from '../db/test-db';
import { transactionsRepo, type TransactionsRepo } from '../db/transactions-repo';
import { account } from '../domain/account';
import { money } from '../domain/money';
import { UNCATEGORISED_CATEGORY_ID, UNSOURCED_SOURCE_ID, type IsoDate } from '../domain/transaction';
import { inMemoryMonobankTokenStore } from '../platform/monobank-token';
import { startOfLocalDayMs } from '../ui/dates';
import type { AuthFetchLike } from './api';
import { syncLinkedAccounts, type SyncPorts, type SyncRun } from './coordinator';
import { budgetedRun, foregroundRun, withRequestTimeout, type SetTimer } from './yielding';

/**
 * The three policies a run can be given for its wait and for the bank's silence, proven the only
 * way that says anything: by driving a whole `syncLinkedAccounts` with them, against the real
 * database and synthetic answers.
 *
 * Nothing here waits a real millisecond. The timer is a hand-driven queue and the clock is the
 * number that queue moves, so «the budget passes» and «the bank never answers» are two lines of a
 * test rather than eight minutes and thirty seconds of one.
 */

const TOKEN = 'uT3st_TOKENnnnnnnnnnnnnnnnnnnnnnnnnnnnnn';
const RUN_AT = Date.UTC(2026, 7, 28, 12, 0, 0);
const AUGUST_28 = Math.floor(Date.UTC(2026, 7, 28, 9, 0, 0) / 1000);
const GAP_MS = 60_000;
const TIMEOUT_MS = 30_000;

const KYIV_OFFSET_SECONDS = 3 * 60 * 60;
const dateOf = (unixSeconds: number): IsoDate =>
  new Date((unixSeconds + KYIV_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10);

const statementItem = (id: string, offsetSeconds = 0) => ({
  id,
  time: AUGUST_28 + offsetSeconds,
  description: 'СІЛЬПО',
  mcc: 4829,
  amount: -12_550,
  currencyCode: 980,
  hold: false,
});

/**
 * The timer as a queue: nothing fires until the test says so, and the clock is wherever the last
 * thing that fired left it. `cancel` really removes the entry, so a test can assert that a wait
 * ended on the foreground event by the timer it never fired.
 */
function fakeTimers(startMs: number) {
  interface Entry {
    readonly at: number;
    readonly fn: () => void;
  }
  let nowMs = startMs;
  let fired = 0;
  let pending: Entry[] = [];
  const setTimer: SetTimer = (fn, ms) => {
    const entry: Entry = { at: nowMs + ms, fn };
    pending.push(entry);
    return () => {
      pending = pending.filter((other) => other !== entry);
    };
  };
  /** Fires the earliest pending timer, moving the clock to it. `false` when there is none. */
  const fireNext = (): boolean => {
    const next = pending.reduce<Entry | undefined>(
      (earliest, entry) => (earliest === undefined || entry.at < earliest.at ? entry : earliest),
      undefined,
    );
    if (next === undefined) {
      return false;
    }
    pending = pending.filter((entry) => entry !== next);
    nowMs = Math.max(nowMs, next.at);
    fired += 1;
    next.fn();
    return true;
  };
  return {
    setTimer,
    nowMs: () => nowMs,
    fireNext,
    pending: () => pending.length,
    fired: () => fired,
  };
}

/** The app's foreground as a fact a test decides, with the subscriptions counted. */
function fakeForeground() {
  let inForeground = true;
  let listeners: (() => void)[] = [];
  return {
    inForeground: () => inForeground,
    onLeaveForeground: (fn: () => void) => {
      listeners.push(fn);
      return () => {
        listeners = listeners.filter((other) => other !== fn);
      };
    },
    leave: () => {
      inForeground = false;
      for (const listener of [...listeners]) {
        listener();
      }
    },
    listening: () => listeners.length,
  };
}

/** Everything queued in the microtask and macrotask lanes, let through. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Runs a sync to its end over a hand-driven timer: let the pending work settle, give the test its
 * chance to change the world, then fire whatever timer the run is waiting on.
 */
async function drive(
  promise: Promise<SyncRun>,
  timers: ReturnType<typeof fakeTimers>,
  onStep?: () => void,
): Promise<SyncRun> {
  let settled = false;
  const tracked = promise.then((run) => {
    settled = true;
    return run;
  });
  for (let step = 0; step < 200 && !settled; step += 1) {
    await flush();
    if (settled) {
      break;
    }
    onStep?.();
    await flush();
    if (settled || !timers.fireNext()) {
      break;
    }
  }
  await flush();
  return tracked;
}

describe('a run that yields', () => {
  let storage: TestStorage;
  let repo: MonobankRepo;
  let txs: TransactionsRepo;

  const boundary = startOfLocalDayMs('2026-08-27');

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, {
      categories: [UNCATEGORISED_CATEGORY_ID, 'groceries'],
      sources: [UNSOURCED_SOURCE_ID],
    });
    repo = monobankRepo(storage.db);
    txs = transactionsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  /** `n` рахунки, `n` monobank accounts and `n` links, plus the client-info body showing them. */
  function linkAccounts(n: number): { clientInfo: unknown } {
    const rows = [];
    for (let index = 0; index < n; index += 1) {
      const id = `mono-${index}`;
      accountsRepo(storage.db).save(
        account({
          id: `account-${index}`,
          name: `картка ${index}`,
          kind: 'spending',
          currency: 'UAH',
          openingBalance: money(0, 'UAH'),
        }),
      );
      repo.upsertAccounts(
        [{ id, kind: 'card', name: `black ··${index}`, currency: 'UAH', bankBalance: money(0, 'UAH') }],
        new Date(RUN_AT - 86_400_000),
      );
      repo.link({
        monobankAccountId: id,
        accountId: `account-${index}`,
        syncStartDate: '2026-08-27',
        cursorMs: boundary,
      });
      rows.push({
        id,
        currencyCode: 980,
        balance: 0,
        creditLimit: 0,
        maskedPan: [`53754100000000${index}`],
        type: 'black',
      });
    }
    return {
      clientInfo: { clientId: 'x', name: 'Власник', accounts: rows, jars: [] },
    };
  }

  /** A fetch answering from a script, with every url it was asked recorded in order. */
  function scriptedFetch(script: {
    clientInfo: unknown;
    statement?: (url: string, call: number) => { status: number; body: unknown };
  }) {
    const calls: string[] = [];
    let statementCalls = 0;
    const fetchImpl: AuthFetchLike = (url) => {
      calls.push(url);
      const answer = url.includes('/client-info')
        ? { status: 200, body: script.clientInfo }
        : (script.statement ?? (() => ({ status: 200, body: [] })))(url, statementCalls++);
      return Promise.resolve({
        ok: answer.status >= 200 && answer.status < 300,
        status: answer.status,
        json: () => Promise.resolve(answer.body),
      });
    };
    return {
      fetchImpl,
      statements: () => calls.filter((url) => url.includes('/statement/')),
      requests: () => calls.length,
    };
  }

  function portsWith(fetchImpl: AuthFetchLike, timers: ReturnType<typeof fakeTimers>): SyncPorts {
    return {
      tokenStore: inMemoryMonobankTokenStore({ token: TOKEN }),
      fetch: fetchImpl,
      storage: repo,
      rules: () => [],
      nowMs: timers.nowMs,
      now: () => new Date(timers.nowMs()),
      dateOf,
      wait: () => Promise.resolve(),
      newId: () => `imported-${txs.listAll().length + 1}`,
      minRequestGapMs: GAP_MS,
    };
  }

  const ran = (run: SyncRun) => {
    if (run.kind !== 'ran') {
      throw new Error(`expected a run, got ${run.kind}`);
    }
    return run;
  };

  const asked = (statements: readonly string[]): string[] =>
    statements.map((url) => url.split('/statement/')[1]!.split('/')[0]!);

  it('Scenario: The budget stops the run before a wait it cannot hold', async () => {
    const { clientInfo } = linkAccounts(3);
    const script = scriptedFetch({ clientInfo });
    const timers = fakeTimers(RUN_AT);
    // Room for the client-info request and one statement request — the minute before it included
    // — and not for the minute before a second.
    const budget = budgetedRun({
      nowMs: timers.nowMs,
      setTimer: timers.setTimer,
      deadlineMs: RUN_AT + GAP_MS + 30_000,
    });

    const run = ran(
      await drive(syncLinkedAccounts({ ...portsWith(script.fetchImpl, timers), ...budget }), timers),
    );

    expect(run.accounts.map((result) => result.outcome)).toEqual([
      'complete',
      'postponed',
      'postponed',
    ]);
    // Two requests, both spent: nothing was sent that the budget could not cover.
    expect(script.requests()).toBe(2);
    expect(asked(script.statements())).toEqual(['mono-0']);
    // And the two the run never asked about took no turn, so they head the next run's order.
    expect(repo.linkOf('mono-1')?.lastAttemptedAtMs).toBeNull();
    expect(repo.linkOf('mono-2')?.lastAttemptedAtMs).toBeNull();
  });

  it('Scenario: A run without a budget postpones nothing', async () => {
    const { clientInfo } = linkAccounts(9);
    const script = scriptedFetch({ clientInfo });
    const timers = fakeTimers(RUN_AT);

    // No `postponed` port at all: the ports a run in front of the owner with the app in front of
    // them answers, and the ones the app shell's follow-up run is given.
    const run = ran(
      await drive(
        syncLinkedAccounts({
          ...portsWith(script.fetchImpl, timers),
          wait: (ms) =>
            new Promise<void>((resolve) => {
              timers.setTimer(resolve, ms);
            }),
        }),
        timers,
      ),
    );

    expect(run.accounts).toHaveLength(9);
    expect(run.accounts.every((result) => result.outcome === 'complete')).toBe(true);
    expect(run.accounts.some((result) => result.outcome === 'postponed')).toBe(false);
    expect(script.statements()).toHaveLength(9);
  });

  it('Scenario: Leaving the app stops the run at its next request', async () => {
    const { clientInfo } = linkAccounts(3);
    const script = scriptedFetch({ clientInfo });
    const timers = fakeTimers(RUN_AT);
    const foreground = fakeForeground();
    const ports = foregroundRun({
      setTimer: timers.setTimer,
      inForeground: foreground.inForeground,
      onLeaveForeground: foreground.onLeaveForeground,
    });

    const run = ran(
      await drive(
        syncLinkedAccounts({ ...portsWith(script.fetchImpl, timers), ...ports }),
        timers,
        () => {
          // The owner leaves while the run sits out the gap before the second рахунок's request.
          if (script.statements().length === 1 && timers.pending() === 1) {
            foreground.leave();
          }
        },
      ),
    );

    expect(run.accounts.map((result) => result.outcome)).toEqual([
      'complete',
      'postponed',
      'postponed',
    ]);
    expect(asked(script.statements())).toEqual(['mono-0']);
    // One timer fired — the gap before the first statement. The second wait ended on the
    // foreground event, and its timer was cancelled rather than left to a paused JS thread that
    // would never run it.
    expect(timers.fired()).toBe(1);
    expect(timers.pending()).toBe(0);
    // And the event the wait subscribed to was let go with it.
    expect(foreground.listening()).toBe(0);
  });

  it('Scenario: An answer in flight is kept', async () => {
    const { clientInfo } = linkAccounts(2);
    const timers = fakeTimers(RUN_AT);
    const foreground = fakeForeground();
    const calls: string[] = [];
    let answerStatement: (() => void) | undefined;
    const fetchImpl: AuthFetchLike = (url) => {
      calls.push(url);
      if (url.includes('/client-info')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(clientInfo),
        });
      }
      // The bank is answering; the owner leaves the app while it is.
      return new Promise((resolve) => {
        answerStatement = () => {
          resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve([statementItem('a1')]),
          });
        };
      });
    };
    const ports = foregroundRun({
      setTimer: timers.setTimer,
      inForeground: foreground.inForeground,
      onLeaveForeground: foreground.onLeaveForeground,
    });

    const run = ran(
      await drive(syncLinkedAccounts({ ...portsWith(fetchImpl, timers), ...ports }), timers, () => {
        if (answerStatement !== undefined) {
          const answer = answerStatement;
          answerStatement = undefined;
          foreground.leave();
          answer();
        }
      }),
    );

    // The answer that was in flight is stored whole; the run stops before the next request.
    expect(run.imported).toBe(1);
    expect(txs.listAll()).toHaveLength(1);
    expect(run.accounts.map((result) => result.outcome)).toEqual(['complete', 'postponed']);
    expect(calls.filter((url) => url.includes('/statement/'))).toHaveLength(1);
    // The run's own end, captured before it paced itself — not wherever the clock ended up.
    expect(repo.linkOf('mono-0')?.cursorMs).toBe(RUN_AT);
  });

  it('Scenario: A request the bank never answers ends unavailable', async () => {
    const { clientInfo } = linkAccounts(2);
    const timers = fakeTimers(RUN_AT);
    const signals: AbortSignal[] = [];
    const fetchImpl = withRequestTimeout(
      (url, _headers, signal) => {
        if (signal) {
          signals.push(signal);
        }
        if (url.includes('/client-info')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(clientInfo),
          });
        }
        if (url.includes('mono-0')) {
          // The bank takes the request and says nothing, ever.
          return new Promise(() => undefined);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([statementItem('b1')]),
        });
      },
      { setTimer: timers.setTimer, timeoutMs: TIMEOUT_MS },
    );

    const run = ran(
      await drive(
        syncLinkedAccounts({
          ...portsWith(fetchImpl, timers),
          wait: (ms) =>
            new Promise<void>((resolve) => {
              timers.setTimer(resolve, ms);
            }),
        }),
        timers,
      ),
    );

    // Given up, and given up as the bank being unavailable — nothing stored, the cursor where it
    // was — while the run went on to the рахунок after it.
    expect(run.accounts.map((result) => result.outcome)).toEqual(['unavailable', 'complete']);
    expect(repo.linkOf('mono-0')?.cursorMs).toBe(boundary);
    expect(repo.importedIds('mono-0').size).toBe(0);
    // The turn its request took is still taken, so the order does not hand it the head again.
    expect(repo.linkOf('mono-0')?.lastAttemptedAtMs).not.toBeNull();
    expect(txs.listAll()).toHaveLength(1);
    // And the socket went with the promise.
    expect(signals.some((signal) => signal.aborted)).toBe(true);
  });

  it('Scenario: A request that answers in time is unaffected', async () => {
    const { clientInfo } = linkAccounts(1);
    const timers = fakeTimers(RUN_AT);
    const fetchImpl = withRequestTimeout(
      (url) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve(url.includes('/client-info') ? clientInfo : [statementItem('a1')]),
        }),
      { setTimer: timers.setTimer, timeoutMs: TIMEOUT_MS },
    );

    const run = ran(
      await drive(
        syncLinkedAccounts({
          ...portsWith(fetchImpl, timers),
          wait: (ms) =>
            new Promise<void>((resolve) => {
              timers.setTimer(resolve, ms);
            }),
        }),
        timers,
      ),
    );

    expect(run.accounts.map((result) => result.outcome)).toEqual(['complete']);
    expect(run.imported).toBe(1);
    expect(txs.listAll()).toHaveLength(1);
    // Nothing about the timeout is left behind: both requests cancelled theirs on answering, so
    // the only timer that ever fired was the gap between them.
    expect(timers.pending()).toBe(0);
    expect(timers.fired()).toBe(1);
  });
});
