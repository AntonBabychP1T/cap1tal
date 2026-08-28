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
import { STATEMENT_PAGE_SIZE, type AuthFetchLike } from './api';
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
      new Date(RUN_AT),
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
      new Date(RUN_AT),
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
      categoryId: 'no-such-category',
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
      new Date(RUN_AT),
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
      new Date(RUN_AT),
    );
    link('mono-white', 'jar');
    const { fetchImpl, statements } = scriptedFetch({
      statement: (url) => (url.includes('mono-card') ? { status: 403, body: {} } : { status: 200, body: [] }),
    });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    expect(run.accounts.map((a) => a.outcome)).toEqual(['invalid-token', 'invalid-token']);
    // One statement request, for the account that failed; the second was never asked.
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
      new Date(RUN_AT),
    );
    link('mono-white', 'jar');
    const { fetchImpl, statements } = scriptedFetch({ statement: () => ({ status: 200, body: [] }) });
    let stop = false;
    const ports = portsWith(fetchImpl, { cancelled: () => stop });
    // Stop as soon as the first account has finished.
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
      obtainedAt: new Date(RUN_AT - 1000),
      cursorMs: boundary,
      storedAt: new Date(RUN_AT - 1000),
    });
    const { fetchImpl, statements } = scriptedFetch({
      clientInfo: () => ({ status: 200, body: { ...CLIENT_INFO, accounts: [] } }),
    });

    const run = ran(await syncLinkedAccounts(portsWith(fetchImpl)));

    expect(run.accounts[0]?.outcome).toBe('unavailable');
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
