import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { accountsRepo } from '../db/accounts-repo';
import { monobankRepo, type MonobankRepo } from '../db/monobank-repo';
import { remindersRepo, type RemindersRepo } from '../db/reminders-repo';
import { openTestDb, seedReferences, type TestStorage } from '../db/test-db';
import { transactionsRepo } from '../db/transactions-repo';
import { account } from '../domain/account';
import { money } from '../domain/money';
import { UNCATEGORISED_CATEGORY_ID, UNSOURCED_SOURCE_ID, type IsoDate } from '../domain/transaction';
import type { AuthFetchLike } from '../monobank/api';
import { syncDue } from '../monobank/auto';
import type { SyncPorts, SyncProgress } from '../monobank/coordinator';
import {
  inMemoryLocalNotifications,
  type LocalNotificationsDouble,
} from '../platform/local-notifications';
import { inMemoryMonobankTokenStore, type MonobankTokenStore } from '../platform/monobank-token';
import { ALERT_NOTICES } from '../reminders/notices';
import type { JournalEntry } from '../reporting/journal';
import { networkSummary } from '../reporting/report';
import { startOfLocalDayMs } from './dates';
import { bindTestJournal } from './journal';
import {
  composeProgress,
  journalProgress,
  onSyncState,
  startSync,
  syncEnding,
  syncInFlight,
  type StartSyncPorts,
} from './monobank-sync';

/**
 * The one entry point every sync goes through: its lock, the attempt it writes around the run,
 * and the one line about сповіщення.
 *
 * The bank is a function answering from a script, the token is a made-up string in an in-memory
 * store, and the request gap is waited out by a fake — nothing here reaches the network, waits a
 * real millisecond or loads a native module. The database is real, because what the attempt is
 * worth is exactly whether it survives a read.
 */

const TOKEN = 'uT3st_TOKENnnnnnnnnnnnnnnnnnnnnnnnnnnnnn';
const RUN_AT = Date.UTC(2026, 8, 2, 12, 0, 0);

const VOCABULARY = {
  categories: [UNCATEGORISED_CATEGORY_ID],
  sources: [UNSOURCED_SOURCE_ID],
} as const;

const card = account({
  id: 'card',
  name: 'mono black',
  kind: 'spending',
  currency: 'UAH',
  openingBalance: money(10_000_00, 'UAH'),
});

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
  ],
  jars: [],
};

/** The same token's client-info when three рахунки are linked, so a run can end part-done. */
const CLIENT_INFO_THREE = {
  ...CLIENT_INFO,
  accounts: [
    ...CLIENT_INFO.accounts,
    {
      id: 'mono-white',
      currencyCode: 980,
      balance: 15_000,
      creditLimit: 0,
      maskedPan: ['537541******9999'],
      type: 'white',
    },
    {
      id: 'mono-plat',
      currencyCode: 980,
      balance: 5_000,
      creditLimit: 0,
      maskedPan: ['537541******7777'],
      type: 'platinum',
    },
  ],
};

describe('the one place a sync is started', () => {
  let storage: TestStorage;
  let repo: MonobankRepo;
  let reminders: RemindersRepo;
  let phone: LocalNotificationsDouble;
  let journalOf: () => readonly JournalEntry[];
  /** Resolved by a test to let a run that is deliberately held up finish. */
  let release: (() => void) | undefined;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    accountsRepo(storage.db).save(card);
    repo = monobankRepo(storage.db);
    reminders = remindersRepo(storage.db);
    phone = inMemoryLocalNotifications();
    journalOf = bindTestJournal();
    release = undefined;
  });

  afterEach(() => {
    storage.close();
  });

  function linkCard(): void {
    repo.upsertAccounts(
      [
        {
          id: 'mono-card',
          kind: 'card',
          name: 'black ··1234',
          currency: 'UAH',
          bankBalance: money(990_000, 'UAH'),
        },
      ],
      new Date(RUN_AT - 86_400_000),
    );
    repo.link({
      monobankAccountId: 'mono-card',
      accountId: 'card',
      syncStartDate: '2026-09-01',
      cursorMs: startOfLocalDayMs('2026-09-01' as IsoDate),
    });
  }

  /** Two more linked рахунки beside `linkCard`'s, for a run that gets through only some of them. */
  function linkTwoMoreCards(): void {
    for (const [monobankAccountId, accountId, name] of [
      ['mono-white', 'card-white', 'white ··9999'],
      ['mono-plat', 'card-plat', 'platinum ··7777'],
    ] as const) {
      accountsRepo(storage.db).save(
        account({
          id: accountId,
          name,
          kind: 'spending',
          currency: 'UAH',
          openingBalance: money(0, 'UAH'),
        }),
      );
      repo.upsertAccounts(
        [{ id: monobankAccountId, kind: 'card', name, currency: 'UAH', bankBalance: money(0, 'UAH') }],
        new Date(RUN_AT - 86_400_000),
      );
      repo.link({
        monobankAccountId,
        accountId,
        syncStartDate: '2026-09-01',
        cursorMs: startOfLocalDayMs('2026-09-01' as IsoDate),
      });
    }
  }

  /** A bank that answers from a script; `hold` lets a test keep a run in flight. */
  function bank(
    script: {
      clientInfo?: () => { status: number; body: unknown };
      statement?: () => { status: number; body: unknown };
    } = {},
    hold?: Promise<void>,
  ): AuthFetchLike {
    return async (url) => {
      if (hold) {
        await hold;
      }
      const answer = url.includes('/client-info')
        ? (script.clientInfo ?? (() => ({ status: 200, body: CLIENT_INFO })))()
        : (script.statement ?? (() => ({ status: 200, body: [] })))();
      return {
        ok: answer.status >= 200 && answer.status < 300,
        status: answer.status,
        json: () => Promise.resolve(answer.body),
      };
    };
  }

  function ports(
    fetchImpl: AuthFetchLike,
    over: {
      tokenStore?: MonobankTokenStore;
      attended?: boolean;
      alerts?: boolean;
      sync?: Partial<SyncPorts>;
    } = {},
  ): StartSyncPorts {
    return {
      sync: {
        tokenStore: over.tokenStore ?? inMemoryMonobankTokenStore({ token: TOKEN }),
        fetch: fetchImpl,
        storage: repo,
        rules: () => [],
        nowMs: () => RUN_AT,
        now: () => new Date(RUN_AT),
        dateOf: (unixSeconds) => new Date(unixSeconds * 1000).toISOString().slice(0, 10) as IsoDate,
        wait: () => Promise.resolve(),
        newId: () => 'id-1',
        // A real minute would make this suite take one.
        minRequestGapMs: 0,
        ...over.sync,
      },
      attempts: repo,
      ...(over.alerts === false
        ? {}
        : { alerts: { notifications: phone, storage: reminders, now: () => new Date(RUN_AT) } }),
      attended: over.attended ?? true,
    };
  }

  /** A promise a test resolves through `release`, used to hold a run in flight. */
  function held(): Promise<void> {
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  }

  describe('one run at a time', () => {
    it('Scenario: A second trigger during a run starts nothing', async () => {
      linkCard();
      const gate = held();
      const first = startSync(ports(bank({}, gate)));
      expect(syncInFlight()).toBe(true);

      const second = startSync(ports(bank({}, gate)));
      release?.();

      expect((await second).kind).toBe('already-running');
      expect((await first).kind).toBe('ran');
      // The refused start changed nothing: one run's worth of work, one attempt.
      expect(repo.attempt()).toEqual({ attemptedAtMs: RUN_AT, outcome: 'complete' });
      expect(syncInFlight()).toBe(false);
    });

    it('Scenario: The owner asking during a run is told, not queued', async () => {
      linkCard();
      const gate = held();
      const first = startSync(ports(bank({}, gate)));

      const asked = startSync(ports(bank({}, gate)));
      release?.();
      const answer = await asked;

      expect(answer.kind).toBe('already-running');
      // It reports what the run in flight came to, which is what a pull needs to stop spinning.
      expect(answer.run?.kind).toBe('ran');
      await first;
    });

    it('Scenario: A run beginning is announced, not only its end', async () => {
      linkCard();
      const seen: boolean[] = [];
      const stop = onSyncState(() => seen.push(syncInFlight()));
      try {
        const gate = held();
        const running = startSync(ports(bank({}, gate)));
        // Announced the moment it began — a screen already open hears it without being reopened.
        expect(seen).toEqual([true]);
        release?.();
        await running;
        expect(seen).toEqual([true, false]);
      } finally {
        stop();
      }
    });

    it('Scenario: After a run ends the next one may start', async () => {
      linkCard();
      expect((await startSync(ports(bank()))).kind).toBe('ran');
      expect((await startSync(ports(bank()))).kind).toBe('ran');
    });

    it('a run that ends by throwing releases the lock, and refuses rather than fails', async () => {
      linkCard();
      const gate = held();
      // Storage refusing a read: not an outcome the coordinator has a word for, so it comes out
      // as a throw. `syncLinkedAccounts` reads the links after the token, so this lands inside
      // the run rather than before it.
      const breaking = ports(bank({}, gate));
      const failing = startSync({
        ...breaking,
        sync: {
          ...breaking.sync,
          rules: () => {
            throw new Error('сховище не відповідає');
          },
        },
      });
      // A start refused while that run is in flight reports; it does not adopt the rejection.
      const refused = startSync(ports(bank({}, gate)));
      release?.();

      const answer = await refused;
      expect(answer.kind).toBe('already-running');
      expect(answer.run).toBeUndefined();
      await expect(failing).rejects.toThrow(/сховище/);

      // And the lock is released, so the device is not left unable to sync ever again.
      expect(syncInFlight()).toBe(false);
      expect((await startSync(ports(bank()))).kind).toBe('ran');
    });

    it('Scenario: A run the owner asked for ignores the interval', async () => {
      linkCard();
      // An attempt one minute old — well inside the quiet interval, so `syncDue` says no...
      expect(
        syncDue({ links: 1, attemptedAtMs: RUN_AT - 60_000, nowMs: RUN_AT }),
      ).toBe(false);
      repo.beginAttempt(new Date(RUN_AT - 60_000));
      repo.finishAttempt('complete');

      // ...and `startSync` runs anyway, because the interval governs only the runs the owner did
      // not ask for. Nothing in the entry point consults it.
      const answer = await startSync(ports(bank()));

      expect(answer.kind).toBe('ran');
      expect(answer.run?.kind).toBe('ran');
      expect(repo.attempt()).toEqual({ attemptedAtMs: RUN_AT, outcome: 'complete' });
    });

    it('a listener that unsubscribed hears nothing more', async () => {
      linkCard();
      let heard = 0;
      onSyncState(() => (heard += 1))();
      await startSync(ports(bank()));
      expect(heard).toBe(0);
    });
  });

  describe('the attempt written around the run', () => {
    it('Scenario: A run the app did not survive still holds its moment', async () => {
      linkCard();
      let duringRun: ReturnType<MonobankRepo['attempt']>;
      // Read from inside the first request: this is exactly the state an app killed mid-sync
      // leaves behind, and the point is that the moment is already there.
      const spy: AuthFetchLike = (url, headers) => {
        duringRun ??= repo.attempt();
        return bank()(url, headers);
      };

      await startSync(ports(spy));

      expect(duringRun).toEqual({ attemptedAtMs: RUN_AT });
      expect(duringRun?.outcome).toBeUndefined();
    });

    it('Scenario: A failed run still spends its interval', async () => {
      linkCard();

      await startSync(ports(bank({ clientInfo: () => ({ status: 500, body: {} }) })));

      // It reached the bank and got nothing, which is precisely the case the interval exists for.
      expect(repo.attempt()).toEqual({ attemptedAtMs: RUN_AT, outcome: 'unavailable' });
    });

    it('a rejected token is remembered as such', async () => {
      linkCard();

      await startSync(ports(bank({ clientInfo: () => ({ status: 403, body: {} }) })));

      expect(repo.attempt()?.outcome).toBe('invalid-token');
    });

    it('Scenario: Without a token nothing is attempted', async () => {
      linkCard();
      const calls: string[] = [];
      const counted: AuthFetchLike = (url, headers) => {
        calls.push(url);
        return bank()(url, headers);
      };

      const answer = await startSync(
        ports(counted, { tokenStore: inMemoryMonobankTokenStore({}) }),
      );

      expect(answer.run?.kind).toBe('not-configured');
      expect(calls).toEqual([]);
      // Withdrawn, not merely never written: the next opening must try at once rather than wait
      // out a quiet interval for a run that never happened.
      expect(repo.attempt()).toBeUndefined();
    });

    it('Scenario: With nothing linked nothing is attempted', async () => {
      // No link at all — `linkCard` deliberately not called.
      const answer = await startSync(ports(bank()));

      expect(answer.run?.kind).toBe('no-links');
      expect(repo.attempt()).toBeUndefined();
    });

    it('Scenario: Unreadable token storage is not an attempt either', async () => {
      linkCard();

      const answer = await startSync(
        ports(bank(), { tokenStore: inMemoryMonobankTokenStore({ unavailable: true }) }),
      );

      expect(answer.run?.kind).toBe('storage-unavailable');
      expect(repo.attempt()).toBeUndefined();
    });

    it('a later run replaces the attempt rather than adding to it', async () => {
      linkCard();
      await startSync(ports(bank({ clientInfo: () => ({ status: 500, body: {} }) })));
      expect(repo.attempt()?.outcome).toBe('unavailable');

      await startSync(ports(bank()));

      expect(repo.attempt()).toEqual({ attemptedAtMs: RUN_AT, outcome: 'complete' });
    });
  });

  describe('what it says to the owner', () => {
    it('Scenario: A failing automatic run posts no notification', async () => {
      linkCard();

      // `attended: true` is what the automatic run passes, and it is a fact: that run exists
      // because the app was opened, so the owner is in it.
      await startSync(ports(bank({ clientInfo: () => ({ status: 500, body: {} }) })));

      expect(phone.posted()).toEqual([]);
      // Nothing outstanding either, so no later screen has a stale сповіщення to clear.
      expect(reminders.outstandingKinds()).toEqual([]);
      // The журнал still holds that it failed — one entry naming the kind, and no summary text
      // the owner was never shown. (The run's own two `step` entries are beside it; they name the
      // run and the word it came to, and carry no text either.)
      expect(
        journalOf()
          .filter((entry) => entry.kind === 'alert')
          .map((entry) => [entry.kind, entry.name, entry.detail ?? null]),
      ).toEqual([['alert', 'monobank-sync', null]]);
    });

    it('a failure nobody is watching does post one', async () => {
      linkCard();

      await startSync(
        ports(bank({ clientInfo: () => ({ status: 500, body: {} }) }), { attended: false }),
      );

      expect(phone.posted()).toEqual([ALERT_NOTICES['monobank-sync'].id]);
      expect(reminders.outstandingKinds()).toEqual(['monobank-sync']);
    });

    it('Scenario: A run that yielded raises no сповіщення про збій', async () => {
      linkCard();
      linkTwoMoreCards();
      let statements = 0;
      const answering = bank({ clientInfo: () => ({ status: 200, body: CLIENT_INFO_THREE }) });
      const fetchImpl: AuthFetchLike = (url, headers) => {
        if (url.includes('/statement/')) {
          statements += 1;
        }
        return answering(url, headers);
      };

      // A run the owner started on the monobank screen and then left: `attended: false` is that
      // screen's own answer, and the run is out of the foreground it was started in after the
      // first рахунок.
      const answer = await startSync(
        ports(fetchImpl, { attended: false, sync: { postponed: () => statements >= 1 } }),
      );

      const run = answer.kind === 'ran' ? answer.run : undefined;
      expect(run?.kind === 'ran' ? run.accounts.map((a) => a.outcome) : []).toEqual([
        'complete',
        'postponed',
        'postponed',
      ]);
      // A run that stopped is not a run that failed: nothing in the shade, nothing outstanding,
      // and not even a журнал line about a сповіщення, because none was decided.
      expect(phone.posted()).toEqual([]);
      expect(reminders.outstandingKinds()).toEqual([]);
      // No `alert` entry at all: a run that merely stopped is not a run that failed. The run's
      // own `step` entries are beside the point here and are asserted where they belong.
      expect(journalOf().filter((entry) => entry.kind === 'alert')).toEqual([]);
      expect(repo.attempt()?.outcome).toBe('postponed');
    });

    it('Scenario: A run the owner stopped raises no сповіщення про збій', async () => {
      linkCard();

      // «Зупинити», and the owner is no longer looking at the screen when the run ends.
      await startSync(ports(bank(), { attended: false, sync: { cancelled: () => true } }));

      expect(phone.posted()).toEqual([]);
      expect(reminders.outstandingKinds()).toEqual([]);
      // No `alert` entry at all: a run that merely stopped is not a run that failed. The run's
      // own `step` entries are beside the point here and are asserted where they belong.
      expect(journalOf().filter((entry) => entry.kind === 'alert')).toEqual([]);
      expect(repo.attempt()?.outcome).toBe('cancelled');
    });

    it('Scenario: A run that works clears what an earlier failure left standing', async () => {
      linkCard();
      // The failure the owner was away for: it posted, and it is outstanding.
      await startSync(
        ports(bank({ clientInfo: () => ({ status: 500, body: {} }) }), { attended: false }),
      );
      expect(reminders.outstandingKinds()).toEqual(['monobank-sync']);

      await startSync(ports(bank()));

      expect(reminders.outstandingKinds()).toEqual([]);
      // Taken off the phone, not merely forgotten in storage.
      expect(phone.showing()).toEqual([]);
      expect(phone.cleared()).toEqual([ALERT_NOTICES['monobank-sync'].id]);
    });

    it('Scenario: A successful automatic run says nothing', async () => {
      linkCard();
      // Configured exactly as the app shell configures it — alert ports present, `attended: true`
      // — so this proves the automatic run's own silence and not a run without сповіщення at all.
      const answer = await startSync(
        ports(
          bank({
            statement: () => ({
              status: 200,
              body: [
                {
                  id: 'a1',
                  time: Math.floor(RUN_AT / 1000) - 3600,
                  description: 'СІЛЬПО',
                  mcc: 5411,
                  amount: -12550,
                  currencyCode: 980,
                  hold: false,
                },
              ],
            }),
          }),
        ),
      );

      expect(answer.run?.kind).toBe('ran');
      expect(phone.posted()).toEqual([]);
      expect(phone.showing()).toEqual([]);
      expect(reminders.outstandingKinds()).toEqual([]);
      // The транзакція it imported is the whole of what it said.
      expect(transactionsRepo(storage.db).listLatest(5)).toHaveLength(1);
    });

    it('Scenario: An automatic run that imported nothing says nothing either', async () => {
      linkCard();

      const answer = await startSync(ports(bank()));

      expect(answer.run).toEqual({ kind: 'ran', imported: 0, accounts: expect.anything() });
      expect(phone.posted()).toEqual([]);
      expect(phone.showing()).toEqual([]);
      expect(reminders.outstandingKinds()).toEqual([]);
      // ...and the freshness the owner will read did move, which is the one thing it does say.
      expect(repo.listLinks()[0]?.lastSyncedAtMs).toBe(RUN_AT);
    });

    it('a run with no сповіщення ports at all is silent and still writes its attempt', async () => {
      linkCard();

      await startSync(ports(bank(), { alerts: false }));

      expect(repo.attempt()?.outcome).toBe('complete');
      expect(phone.posted()).toEqual([]);
    });
  });

  describe('what the журнал records about a run', () => {
    it('Scenario: A sync run reads as a run — a beginning, the turns and an ending, all one mark', () => {
      const write = journalProgress('r1');

      write({ kind: 'started', accounts: 3 });
      write({ kind: 'account', monobankAccountId: 'mono-card', index: 1, of: 3 });
      write({
        kind: 'finished-account',
        result: {
          monobankAccountId: 'mono-card',
          accountId: 'card',
          outcome: 'complete',
          imported: 4,
        },
      });
      write({ kind: 'waiting', ms: 60_000 });
      write({ kind: 'account', monobankAccountId: 'mono-plat', index: 2, of: 3 });
      write({
        kind: 'finished-account',
        result: {
          monobankAccountId: 'mono-plat',
          accountId: 'card-plat',
          outcome: 'unavailable',
          imported: 0,
        },
      });

      const written = journalOf();
      expect(written.map((e) => [e.kind, e.name, e.detail ?? null])).toEqual([
        ['step', 'monobank-sync', 'рахунки'],
        ['step', 'monobank-sync/mono-card', 'почалось'],
        ['step', 'monobank-sync/mono-card', 'complete'],
        ['step', 'monobank-sync/wait', null],
        ['step', 'monobank-sync/mono-plat', 'почалось'],
        ['step', 'monobank-sync/mono-plat', 'unavailable'],
      ]);
      expect(written.every((e) => e.run === 'r1')).toBe(true);
      expect(written[0]?.counts).toEqual({ accounts: 3 });
      expect(written[3]?.counts).toEqual({ ms: 60_000 });
    });

    it('Scenario: A рахунок that fails is named among those that did not', () => {
      const write = journalProgress('r1');

      for (const [monobankAccountId, accountId, outcome, imported] of [
        ['mono-card', 'card', 'complete', 2],
        ['mono-white', 'card-white', 'complete', 1],
        ['mono-plat', 'card-plat', 'unavailable', 0],
      ] as const) {
        write({
          kind: 'finished-account',
          result: { monobankAccountId, accountId, outcome, imported },
        });
      }

      expect(journalOf().map((e) => [e.name, e.detail])).toEqual([
        ['monobank-sync/mono-card', 'complete'],
        ['monobank-sync/mono-white', 'complete'],
        ['monobank-sync/mono-plat', 'unavailable'],
      ]);
      // Which рахунок it was, by the bank's own identifier — the one thing that answers it.
      expect(journalOf()[2]?.name).toContain('mono-plat');
    });

    it('Scenario: A недоступно рахунок names a currency that does not match its own', () => {
      const write = journalProgress('r1');

      write({
        kind: 'finished-account',
        result: {
          monobankAccountId: 'mono-plat',
          accountId: 'card-plat',
          outcome: 'unavailable',
          imported: 0,
          reason: 'currency-mismatch',
        },
      });

      expect(journalOf().map((e) => [e.name, e.detail])).toEqual([
        ['monobank-sync/mono-plat', 'unavailable'],
        ['monobank-sync/mono-plat', 'currency-mismatch'],
      ]);
      expect(journalOf().every((e) => e.run === 'r1')).toBe(true);
    });

    it('Scenario: A недоступно рахунок names a body it could not read at all', () => {
      const write = journalProgress('r1');

      write({
        kind: 'finished-account',
        result: {
          monobankAccountId: 'mono-plat',
          accountId: 'card-plat',
          outcome: 'unavailable',
          imported: 0,
          reason: 'unparseable-body',
        },
      });

      expect(journalOf().map((e) => e.detail)).toEqual(['unavailable', 'unparseable-body']);
    });

    it('Scenario: A недоступно рахунок names a body of the wrong shape', () => {
      const write = journalProgress('r1');

      write({
        kind: 'finished-account',
        result: {
          monobankAccountId: 'mono-plat',
          accountId: 'card-plat',
          outcome: 'unavailable',
          imported: 0,
          reason: 'unreadable-payload',
        },
      });

      expect(journalOf().map((e) => e.detail)).toEqual(['unavailable', 'unreadable-payload']);
    });

    it('Scenario: A недоступно рахунок with no answer to read names no reason', () => {
      const write = journalProgress('r1');

      write({
        kind: 'finished-account',
        result: {
          monobankAccountId: 'mono-gone',
          accountId: 'card-gone',
          outcome: 'unavailable',
          imported: 0,
        },
      });

      // Exactly the one entry it wrote before this change — no second entry appears.
      expect(journalOf()).toHaveLength(1);
      expect(journalOf().map((e) => e.detail)).toEqual(['unavailable']);
    });

    it('composes with the listener the caller already had, so a screen keeps its progress', () => {
      const heard: SyncProgress[] = [];
      const write = composeProgress('r1', (progress) => heard.push(progress));
      const events: SyncProgress[] = [
        { kind: 'started', accounts: 1 },
        { kind: 'account', monobankAccountId: 'mono-card', index: 1, of: 1 },
        { kind: 'waiting', ms: 60_000 },
        {
          kind: 'finished-account',
          result: {
            monobankAccountId: 'mono-card',
            accountId: 'card',
            outcome: 'complete',
            imported: 0,
          },
        },
      ];

      events.forEach(write);

      // Every event, unchanged — and an entry for every one of them beside it.
      expect(heard).toEqual(events);
      expect(journalOf()).toHaveLength(events.length);
    });

    it('records the event even when the listener beside it throws', () => {
      const write = composeProgress('r1', () => {
        throw new Error('setState after unmount');
      });

      expect(() => write({ kind: 'started', accounts: 1 })).toThrow('setState after unmount');
      expect(journalOf()).toHaveLength(1);
    });

    it("names a run that never reached the bank by the coordinator's own word", () => {
      expect(syncEnding({ kind: 'not-configured' })).toEqual({ detail: 'not-configured' });
      expect(syncEnding({ kind: 'no-links' })).toEqual({ detail: 'no-links' });
      expect(
        syncEnding({
          kind: 'ran',
          imported: 5,
          accounts: [
            { monobankAccountId: 'mono-card', accountId: 'card', outcome: 'complete', imported: 5 },
          ],
        }),
      ).toEqual({ detail: 'complete', counts: { imported: 5, accounts: 1 } });
    });

    it('records both ends of a run that never reached the bank', async () => {
      // No token kept: the coordinator answers before its own `started` event ever fires, so
      // these two entries are the only record there is of the run having happened at all.
      const started = await startSync({
        ...ports(bank(), { tokenStore: inMemoryMonobankTokenStore() }),
        run: 'r-run',
      });

      expect(started.kind).toBe('ran');
      expect(journalOf().map((e) => [e.kind, e.name, e.detail, e.run])).toEqual([
        ['step', 'monobank-sync', 'почалось', 'r-run'],
        ['step', 'monobank-sync', 'not-configured', 'r-run'],
      ]);
    });

    it('writes the words the репорт reads back — the summary counts the run it wrote', async () => {
      // The one seam between the writer's vocabulary and the reader's: `networkSummary` finds a
      // run by the very `detail` `journal.step` writes. Change the word in one place without the
      // other and the репорт silently says «Синхронізацій: 0» — which no test that builds its
      // entries by hand would ever notice.
      await startSync({
        ...ports(bank(), { tokenStore: inMemoryMonobankTokenStore() }),
        run: 'r-run',
      });

      const summary = networkSummary(journalOf());
      expect(summary.syncRuns).toBe(1);
      expect(summary.lastRun).toBe('not-configured');
    });

    it("records a completed run's ending with what it imported", async () => {
      linkCard();

      await startSync({
        ...ports(
          bank({
            statement: () => ({
              status: 200,
              body: [
                {
                  id: 'a1',
                  time: Math.floor(RUN_AT / 1000) - 3600,
                  description: 'СІЛЬПО',
                  mcc: 5411,
                  amount: -12550,
                  currencyCode: 980,
                  hold: false,
                },
              ],
            }),
          }),
        ),
        run: 'r-run',
      });

      const ends = journalOf().filter((e) => e.kind === 'step' && e.name === 'monobank-sync');
      expect(ends.map((e) => e.detail)).toEqual(['почалось', 'complete']);
      expect(ends[1]?.counts).toEqual({ imported: 1, accounts: 1 });
      expect(ends[1]?.tookMs).toBeGreaterThanOrEqual(0);
      expect(ends.every((e) => e.run === 'r-run')).toBe(true);
    });
  });
});
