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
import type { SyncPorts } from '../monobank/coordinator';
import {
  inMemoryLocalNotifications,
  type LocalNotificationsDouble,
} from '../platform/local-notifications';
import { inMemoryMonobankTokenStore, type MonobankTokenStore } from '../platform/monobank-token';
import { ALERT_NOTICES } from '../reminders/notices';
import type { JournalEntry } from '../reporting/journal';
import { startOfLocalDayMs } from './dates';
import { bindJournal, resetJournalForTests } from './journal';
import { onSyncState, startSync, syncInFlight, type StartSyncPorts } from './monobank-sync';

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

function bindTestJournal(): () => readonly JournalEntry[] {
  const entries: JournalEntry[] = [];
  resetJournalForTests();
  bindJournal({
    append: (entry) => entries.push(entry),
    tail: () => entries,
    byId: (id) => entries.find((entry) => entry.id === id) ?? null,
  });
  return () => entries;
}

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
      // the owner was never shown.
      expect(journalOf().map((entry) => [entry.kind, entry.name])).toEqual([
        ['alert', 'monobank-sync'],
      ]);
    });

    it('a failure nobody is watching does post one', async () => {
      linkCard();

      await startSync(
        ports(bank({ clientInfo: () => ({ status: 500, body: {} }) }), { attended: false }),
      );

      expect(phone.posted()).toEqual([ALERT_NOTICES['monobank-sync'].id]);
      expect(reminders.outstandingKinds()).toEqual(['monobank-sync']);
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
});
