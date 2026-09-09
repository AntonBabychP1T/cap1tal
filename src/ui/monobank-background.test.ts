import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { accountsRepo } from '../db/accounts-repo';
import { monobankRepo, type MonobankRepo } from '../db/monobank-repo';
import { remindersRepo, type RemindersRepo } from '../db/reminders-repo';
import { openTestDb, seedReferences, type TestStorage } from '../db/test-db';
import { transactionsRepo, type TransactionsRepo } from '../db/transactions-repo';
import { account } from '../domain/account';
import { money } from '../domain/money';
import { UNCATEGORISED_CATEGORY_ID, UNSOURCED_SOURCE_ID, type IsoDate } from '../domain/transaction';
import type { AuthFetchLike } from '../monobank/api';
import { followUpDue, QUIET_INTERVAL_MS } from '../monobank/auto';
import type { SyncPorts } from '../monobank/coordinator';
import {
  inMemoryLocalNotifications,
  type LocalNotificationsDouble,
} from '../platform/local-notifications';
import { inMemoryMonobankTokenStore, type MonobankTokenStore } from '../platform/monobank-token';
import { ALERT_NOTICES } from '../reminders/notices';
import type { JournalEntry } from '../reporting/journal';
import { startOfLocalDayMs } from './dates';
import { bindTestJournal } from './journal';
import {
  backgroundTurnsWanted,
  journalChance,
  journalRegistration,
  runBackgroundTurn,
  type BackgroundTurnPorts,
} from './monobank-background';
import { startSync } from './monobank-sync';

/**
 * One chance the phone gives, from end to end: whether it syncs, what it stores, and what the
 * owner is told about it — against the in-memory token store, a bank answering from a script and
 * a real database. Nothing here loads a native module, reaches the network or waits a real
 * millisecond, which is the whole point of the budget and the clock being inputs.
 */

const TOKEN = 'uT3st_TOKENnnnnnnnnnnnnnnnnnnnnnnnnnnnnn';
const CHANCE_AT = Date.UTC(2026, 8, 2, 3, 30, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const SYNC_START = '2026-09-01' as IsoDate;
const AUGUST_28 = Math.floor(Date.UTC(2026, 7, 28, 9, 0, 0) / 1000);

const VOCABULARY = {
  categories: [UNCATEGORISED_CATEGORY_ID],
  sources: [UNSOURCED_SOURCE_ID],
} as const;

const statementItem = (id: string) => ({
  id,
  time: AUGUST_28,
  description: 'СІЛЬПО',
  mcc: 4829,
  amount: -12_550,
  currencyCode: 980,
  hold: false,
});

/** Everything queued in the microtask and macrotask lanes, let through. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('one chance the phone gives', () => {
  let storage: TestStorage;
  let repo: MonobankRepo;
  let reminders: RemindersRepo;
  let txs: TransactionsRepo;
  let phone: LocalNotificationsDouble;
  let journalOf: () => readonly JournalEntry[];
  let clockMs: number;
  let release: (() => void) | undefined;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    repo = monobankRepo(storage.db);
    reminders = remindersRepo(storage.db);
    txs = transactionsRepo(storage.db);
    phone = inMemoryLocalNotifications();
    journalOf = bindTestJournal();
    clockMs = CHANCE_AT;
    release = undefined;
  });

  afterEach(() => {
    release?.();
    storage.close();
  });

  /** `n` рахунки linked to `n` monobank accounts, and the client-info body that shows them all. */
  function linkCards(n: number): { clientInfo: unknown } {
    const rows = [];
    for (let index = 0; index < n; index += 1) {
      const monobankAccountId = `mono-${index}`;
      const accountId = `card-${index}`;
      accountsRepo(storage.db).save(
        account({
          id: accountId,
          name: `картка ${index}`,
          kind: 'spending',
          currency: 'UAH',
          openingBalance: money(0, 'UAH'),
        }),
      );
      repo.upsertAccounts(
        [
          {
            id: monobankAccountId,
            kind: 'card',
            name: `black ··${index}`,
            currency: 'UAH',
            bankBalance: money(990_000, 'UAH'),
          },
        ],
        new Date(CHANCE_AT - 86_400_000),
      );
      repo.link({
        monobankAccountId,
        accountId,
        syncStartDate: SYNC_START,
        cursorMs: startOfLocalDayMs(SYNC_START),
      });
      rows.push({
        id: monobankAccountId,
        currencyCode: 980,
        balance: 990_000,
        creditLimit: 0,
        maskedPan: [`53754100000000${index}`],
        type: 'black',
      });
    }
    return { clientInfo: { clientId: 'x', name: 'Власник', accounts: rows, jars: [] } };
  }

  /** A bank answering from a script, with every url it was asked recorded. */
  function bank(
    script: {
      clientInfo?: () => { status: number; body: unknown };
      statement?: () => { status: number; body: unknown };
    } = {},
    hold?: Promise<void>,
  ) {
    const calls: string[] = [];
    const fetchImpl: AuthFetchLike = async (url) => {
      calls.push(url);
      if (hold) {
        await hold;
      }
      const answer = url.includes('/client-info')
        ? (script.clientInfo ?? (() => ({ status: 200, body: { accounts: [], jars: [] } })))()
        : (script.statement ?? (() => ({ status: 200, body: [] })))();
      return {
        ok: answer.status >= 200 && answer.status < 300,
        status: answer.status,
        json: () => Promise.resolve(answer.body),
      };
    };
    return { fetchImpl, calls, requests: () => calls.length };
  }

  /**
   * The device's own sync ports as the task hands them over — including the foreground pair,
   * whose `postponed` in a headless process answers yes at once. Every test drives with it, so a
   * `runBackgroundTurn` that forgot to replace it would send nothing and fail here rather than in
   * a smoke test nobody can run without a token.
   */
  function syncPortsLike(
    fetchImpl: AuthFetchLike,
    tokenStore?: MonobankTokenStore,
    gapMs = 0,
  ): SyncPorts {
    return {
      tokenStore: tokenStore ?? inMemoryMonobankTokenStore({ token: TOKEN }),
      fetch: fetchImpl,
      storage: repo,
      rules: () => [],
      nowMs: () => clockMs,
      now: () => new Date(clockMs),
      dateOf: (unixSeconds) => new Date(unixSeconds * 1000).toISOString().slice(0, 10) as IsoDate,
      wait: () => Promise.resolve(),
      postponed: () => true,
      newId: () => `imported-${txs.listAll().length + 1}`,
      minRequestGapMs: gapMs,
    };
  }

  /** A client-info answer of this phone's own for `n` linked рахунки, stored `atMs`. */
  function rememberCards(n: number, atMs: number): void {
    repo.upsertAccounts(
      Array.from({ length: n }, (_, index) => ({
        id: `mono-${index}`,
        kind: 'card' as const,
        name: `black ··${index}`,
        currency: 'UAH' as const,
        bankBalance: money(990_000, 'UAH'),
      })),
      new Date(atMs),
    );
  }

  function turnPorts(
    fetchImpl: AuthFetchLike,
    over: {
      tokenStore?: MonobankTokenStore;
      attended?: boolean;
      /**
       * The bank's minute, for the tests whose subject is the pace. Zero everywhere else, so a
       * test about announcing or the тихий інтервал is not also a test about how many requests a
       * chance affords.
       */
      gapMs?: number;
    } = {},
  ): BackgroundTurnPorts {
    return {
      sync: syncPortsLike(fetchImpl, over.tokenStore, over.gapMs),
      storage: repo,
      alerts: { notifications: phone, storage: reminders, now: () => new Date(clockMs) },
      attended: () => over.attended ?? false,
      nowMs: () => clockMs,
    };
  }

  describe('whether it syncs at all', () => {
    it('Scenario: A background run after the quiet interval syncs without the app being opened', async () => {
      const { clientInfo } = linkCards(1);
      repo.beginAttempt(new Date(CHANCE_AT - 20 * MINUTE));
      repo.finishAttempt('complete');
      const bankPorts = bank({
        clientInfo: () => ({ status: 200, body: clientInfo }),
        statement: () => ({ status: 200, body: [statementItem('a1')] }),
      });

      const turn = await runBackgroundTurn(turnPorts(bankPorts.fetchImpl));

      expect(turn).toEqual({ kind: 'ran', outcome: 'complete', imported: 1 });
      // The транзакції it imported are stored, and the moment it moved is what the app shows
      // when it is next opened.
      expect(txs.listAll()).toHaveLength(1);
      expect(repo.linkOf('mono-0')?.lastSyncedAtMs).toBe(CHANCE_AT);
      // The handed-in `postponed` was replaced rather than obeyed: requests did go out.
      expect(bankPorts.requests()).toBe(2);
    });

    it('Scenario: A chance inside the quiet interval sends nothing', async () => {
      linkCards(1);
      repo.beginAttempt(new Date(CHANCE_AT - 5 * MINUTE));
      repo.finishAttempt('complete');
      const bankPorts = bank();

      const turn = await runBackgroundTurn(turnPorts(bankPorts.fetchImpl));

      expect(turn).toEqual({ kind: 'not-due' });
      expect(bankPorts.requests()).toBe(0);
      // The remembered attempt is exactly as it was — not re-begun and not re-dated.
      expect(repo.attempt()).toMatchObject({
        attemptedAtMs: CHANCE_AT - 5 * MINUTE,
        outcome: 'complete',
      });
    });

    it('Scenario: A chance while a run is going on starts no second one', async () => {
      const { clientInfo } = linkCards(1);
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const foreground = bank({ clientInfo: () => ({ status: 200, body: clientInfo }) }, held);
      // A run the opening started, genuinely waiting on the bank: `postponed` answers no, as the
      // foreground pair does while the app is in front of the owner, so what holds this run is
      // the bank's silence and not a budget of its own.
      const going = startSync({
        sync: { ...syncPortsLike(foreground.fetchImpl), postponed: () => false },
        attempts: repo,
        attended: true,
      });
      await flush();
      // Its request is out and its attempt is written: the lock is held by a real run in flight.
      expect(foreground.requests()).toBe(1);
      expect(repo.attempt()).toMatchObject({ attemptedAtMs: CHANCE_AT });
      const chance = bank({ clientInfo: () => ({ status: 200, body: clientInfo }) });
      // A first sync of several рахунки outlives a quiet interval, so the chance is due — and
      // what refuses it is the one-run lock, not the interval.
      clockMs += QUIET_INTERVAL_MS + MINUTE;

      const turn = runBackgroundTurn(turnPorts(chance.fetchImpl));
      await flush();
      // Waiting on the run in flight rather than racing it: nothing of its own has gone out.
      expect(chance.requests()).toBe(0);
      release?.();

      expect(await turn).toEqual({ kind: 'already-running' });
      // And nothing of its own ever did: the chance changed neither the bank's budget nor the
      // attempt the run in flight was keeping.
      expect(chance.requests()).toBe(0);
      expect(repo.attempt()).toMatchObject({ attemptedAtMs: CHANCE_AT, outcome: 'complete' });
      await going;
    });

    it('Scenario: A chance with nothing linked sends nothing and leaves no attempt', async () => {
      const bankPorts = bank();

      const turn = await runBackgroundTurn(turnPorts(bankPorts.fetchImpl));

      expect(turn).toEqual({ kind: 'not-due' });
      expect(bankPorts.requests()).toBe(0);
      expect(repo.attempt()).toBeUndefined();
    });

    it('Scenario: A chance without a token sends nothing and leaves no attempt', async () => {
      linkCards(1);
      const bankPorts = bank();

      const turn = await runBackgroundTurn(
        turnPorts(bankPorts.fetchImpl, { tokenStore: inMemoryMonobankTokenStore() }),
      );

      expect(turn).toEqual({ kind: 'not-configured' });
      expect(bankPorts.requests()).toBe(0);
      // Withdrawn: a phone with links and no token must not spend a quiet interval on each of its
      // non-attempts.
      expect(repo.attempt()).toBeUndefined();
    });

    it('Scenario: Unreadable token storage on a chance sends nothing and leaves no attempt', async () => {
      const { clientInfo } = linkCards(1);
      const bankPorts = bank({ clientInfo: () => ({ status: 200, body: clientInfo }) });

      const turn = await runBackgroundTurn(
        turnPorts(bankPorts.fetchImpl, {
          tokenStore: inMemoryMonobankTokenStore({ unavailable: true }),
        }),
      );

      expect(turn).toEqual({ kind: 'storage-unavailable' });
      expect(bankPorts.requests()).toBe(0);
      expect(repo.attempt()).toBeUndefined();

      // And the next chance tries again rather than being held off by an attempt nobody made.
      const second = bank({
        clientInfo: () => ({ status: 200, body: clientInfo }),
        statement: () => ({ status: 200, body: [] }),
      });
      const again = await runBackgroundTurn(turnPorts(second.fetchImpl));
      expect(again).toMatchObject({ kind: 'ran', outcome: 'complete' });
    });

    it('Scenario: Chances are wanted exactly while a рахунок is linked', () => {
      expect(backgroundTurnsWanted({ links: repo.listLinks() })).toBe(false);
      linkCards(1);
      expect(backgroundTurnsWanted({ links: repo.listLinks() })).toBe(true);
      repo.unlink('mono-0');
      expect(backgroundTurnsWanted({ links: repo.listLinks() })).toBe(false);
      linkCards(1);
      expect(backgroundTurnsWanted({ links: repo.listLinks() })).toBe(true);
    });
  });

  describe('what it announces', () => {
    const rejected = () => ({ status: 403, body: {} });
    const offline = () => ({ status: 500, body: {} });

    it('Scenario: A rejected token in the background is announced once', async () => {
      linkCards(1);

      await runBackgroundTurn(turnPorts(bank({ clientInfo: rejected }).fetchImpl));

      expect(phone.posted()).toEqual([ALERT_NOTICES['monobank-sync'].id]);
      expect(reminders.outstandingKinds()).toEqual(['monobank-sync']);
      expect(ALERT_NOTICES['monobank-sync'].route).toBe('/manage/monobank');
      expect(
        journalOf()
          .filter((entry) => entry.kind === 'alert')
          .map((entry) => [entry.kind, entry.name]),
      ).toEqual([['alert', 'monobank-sync']]);

      // The next chance, a quiet interval later, ends the same way.
      clockMs += QUIET_INTERVAL_MS + MINUTE;
      await runBackgroundTurn(turnPorts(bank({ clientInfo: rejected }).fetchImpl));

      // One failure is one сповіщення and one record, however many runs end the same way: a phone
      // whose token stays rejected would otherwise flush the журнал within days.
      expect(phone.posted()).toEqual([ALERT_NOTICES['monobank-sync'].id]);
      expect(journalOf().filter((entry) => entry.kind === 'alert')).toHaveLength(1);
    });

    it('Scenario: A phone offline for one run stays silent', async () => {
      linkCards(1);
      repo.markSynced('mono-0', new Date(CHANCE_AT - 2 * HOUR));

      await runBackgroundTurn(turnPorts(bank({ clientInfo: offline }).fetchImpl));

      expect(repo.attempt()?.outcome).toBe('unavailable');
      // A phone in a lift. A row every time the metro did would teach the owner to ignore the
      // section that also holds their чернетки.
      expect(phone.posted()).toEqual([]);
      expect(reminders.outstandingKinds()).toEqual([]);
      expect(journalOf().filter((entry) => entry.kind === 'alert')).toEqual([]);
    });

    it('Scenario: A day without a sync is announced', async () => {
      linkCards(1);
      repo.markSynced('mono-0', new Date(CHANCE_AT - 30 * HOUR));

      await runBackgroundTurn(turnPorts(bank({ clientInfo: offline }).fetchImpl));

      expect(phone.posted()).toEqual([ALERT_NOTICES['monobank-sync'].id]);
      expect(reminders.outstandingKinds()).toEqual(['monobank-sync']);
    });

    it('Scenario: A bank never wholly heard from is stale', async () => {
      linkCards(5);
      // Three of the five completed a sync minutes ago; two never have.
      for (const index of [0, 1, 2]) {
        repo.markSynced(`mono-${index}`, new Date(CHANCE_AT - MINUTE));
      }

      await runBackgroundTurn(turnPorts(bank({ clientInfo: offline }).fetchImpl));

      // The whole-bank reading, not the freshest corner of it: two рахунки have never been heard
      // from, so the picture is not fresh however new the other three are.
      expect(phone.posted()).toEqual([ALERT_NOTICES['monobank-sync'].id]);
    });

    it('Scenario: A postponed run announces nothing', async () => {
      const { clientInfo } = linkCards(2);
      // Stale by any measure, and still nothing is said.
      repo.markSynced('mono-0', new Date(CHANCE_AT - 40 * HOUR));
      repo.markSynced('mono-1', new Date(CHANCE_AT - 40 * HOUR));
      const bankPorts = bank({ clientInfo: () => ({ status: 200, body: clientInfo }) });

      // The whole of the bank's minute still owed: the chance stops before its first request.
      repo.noteRequest(new Date(CHANCE_AT - 1));
      const turn = await runBackgroundTurn(turnPorts(bankPorts.fetchImpl, { gapMs: MINUTE }));

      expect(turn).toMatchObject({ kind: 'ran', outcome: 'postponed' });
      expect(bankPorts.requests()).toBe(0);
      expect(phone.posted()).toEqual([]);
      expect(reminders.outstandingKinds()).toEqual([]);
      // Nothing announced: a run that merely stopped is not a run that failed. The run's own
      // `step` entries are beside that and are asserted where they belong.
      expect(journalOf().filter((entry) => entry.kind === 'alert')).toEqual([]);
      // Neither did it date a sync that did not happen.
      expect(repo.linkOf('mono-0')?.lastSyncedAtMs).toBe(CHANCE_AT - 40 * HOUR);

      // And the attempt it left is the one the app shell finishes at once when the owner comes
      // back — and leaves alone while they have not.
      const attempt = repo.attempt();
      expect(followUpDue({ attempt, inForeground: true })).toBe(true);
      expect(followUpDue({ attempt, inForeground: false })).toBe(false);
    });

    it('Scenario: A failure the owner is already looking at is announced nowhere but on the screen', async () => {
      linkCards(1);

      // The worker starts a chance only in the background, but the owner may open the app inside
      // the eight minutes — and «Потребує уваги» on Головний carries the row in more words than a
      // сповіщення may hold.
      await runBackgroundTurn(
        turnPorts(bank({ clientInfo: rejected }).fetchImpl, { attended: true }),
      );

      expect(phone.posted()).toEqual([]);
      expect(reminders.outstandingKinds()).toEqual([]);
      expect(repo.attempt()?.outcome).toBe('invalid-token');
    });

    it('Scenario: A completed run clears what an earlier one raised', async () => {
      const { clientInfo } = linkCards(1);
      await runBackgroundTurn(turnPorts(bank({ clientInfo: rejected }).fetchImpl));
      expect(reminders.outstandingKinds()).toEqual(['monobank-sync']);

      clockMs += QUIET_INTERVAL_MS + MINUTE;
      await runBackgroundTurn(
        turnPorts(
          bank({
            clientInfo: () => ({ status: 200, body: clientInfo }),
            statement: () => ({ status: 200, body: [] }),
          }).fetchImpl,
        ),
      );

      expect(reminders.outstandingKinds()).toEqual([]);
      // Taken off the phone, not merely forgotten in storage.
      expect(phone.showing()).toEqual([]);
      expect(phone.cleared()).toEqual([ALERT_NOTICES['monobank-sync'].id]);
    });

    it('shows no dialog and writes no text the owner never saw', async () => {
      linkCards(1);

      await runBackgroundTurn(turnPorts(bank({ clientInfo: rejected }).fetchImpl));

      // One сповіщення, whose words are the fixed notice, and one журнал line naming the kind and
      // carrying no detail of its own. What the run *did* is visible where every run's work is:
      // in the транзакції it stored and the moments it moved.
      expect(phone.posted()).toEqual([ALERT_NOTICES['monobank-sync'].id]);
      expect(
        journalOf()
          .filter((entry) => entry.kind === 'alert')
          .map((entry) => [entry.name, entry.detail]),
      ).toEqual([['monobank-sync', undefined]]);
      // And what the run itself wrote is the app's own vocabulary and nothing else — the phase
      // words and the coordinator's own outcome, never a sentence composed about the failure.
      expect(
        journalOf()
          .filter((entry) => entry.kind === 'step')
          .map((entry) => entry.detail),
      ).toEqual(['почалось', 'invalid-token']);
    });
  });

  describe('what the журнал records about a chance', () => {
    const syncTask = readFileSync(
      new URL('../platform/monobank-sync-task.ts', import.meta.url),
      'utf8',
    );
    const backgroundTurn = readFileSync(
      new URL('../platform/background-turn.ts', import.meta.url),
      'utf8',
    );

    it('Scenario: A background chance is an entry — headless, with what the run came to', () => {
      journalChance({
        turn: { kind: 'ran', outcome: 'complete', imported: 4 },
        attended: false,
        run: 'r1',
      });

      expect(journalOf().map((e) => [e.kind, e.name, e.detail])).toEqual([
        ['native', 'background-chance', 'background · complete'],
      ]);
      expect(journalOf()[0]?.counts).toEqual({ imported: 4 });
      // The same mark the run it started carries, so the two read as one operation.
      expect(journalOf()[0]?.run).toBe('r1');
    });

    it('says so when the chance ran while the app was in front of the owner', () => {
      journalChance({ turn: { kind: 'ran', outcome: 'unavailable', imported: 0 }, attended: true });

      expect(journalOf()[0]?.detail).toBe('active · unavailable');
    });

    it("names a chance that did nothing by the turn's own word", () => {
      journalChance({ turn: { kind: 'not-due' }, attended: false });
      journalChance({ turn: { kind: 'already-running' }, attended: false });
      journalChance({ turn: { kind: 'not-configured' }, attended: false });

      expect(journalOf().map((e) => e.detail)).toEqual([
        'background · not-due',
        'background · already-running',
        'background · not-configured',
      ]);
      // Nothing ran, so nothing measured anything.
      expect(journalOf().every((e) => e.counts === undefined)).toBe(true);
    });

    it('Scenario: A refused registration is an entry', () => {
      expect(journalRegistration('refused')).toBe(true);

      expect(journalOf().map((e) => [e.kind, e.name, e.detail])).toEqual([
        ['native', 'background-registration', 'refused'],
      ]);
    });

    it('records a registration and an unregistration, and not the ordinary no-op', () => {
      expect(journalRegistration('registered')).toBe(true);
      expect(journalRegistration('unregistered')).toBe(true);
      // Re-asserted on every launch and every foreground: an entry each time would be noise.
      expect(journalRegistration('unchanged')).toBe(false);

      expect(journalOf().map((e) => e.detail)).toEqual(['registered', 'unregistered']);
    });

    it('is what the two adapters call, and neither holds a decision of its own', () => {
      expect(syncTask).toContain('journalChance({ turn, attended:');
      expect(backgroundTurn).toContain('journalRegistration(await reconcile(name, wanted))');
      for (const adapter of [syncTask, backgroundTurn]) {
        expect(adapter).not.toContain('journal.record(');
      }
    });
  });

  describe('what a chance affords', () => {
    const statementsOf = (calls: readonly string[]) =>
      calls.filter((u) => u.includes('/statement/')).map((u) => u.split('/statement/')[1]!.split('/')[0]!);

    it('Scenario: A chance sends what the gap allows and stops', async () => {
      const { clientInfo } = linkCards(3);
      rememberCards(3, CHANCE_AT - 10 * MINUTE);
      // A quarter of an hour since this phone's last request: longer than the gap, so the chance
      // may send — and, having sent, owes the whole of it again before a second.
      repo.noteRequest(new Date(CHANCE_AT - 15 * MINUTE));
      const bankPorts = bank({
        clientInfo: () => ({ status: 200, body: clientInfo }),
        statement: () => ({ status: 200, body: [] }),
      });

      const turn = await runBackgroundTurn(turnPorts(bankPorts.fetchImpl, { gapMs: MINUTE }));

      // One request, and it went to the statement rather than to balances this phone already had.
      expect(bankPorts.requests()).toBe(1);
      expect(statementsOf(bankPorts.calls)).toEqual(['mono-0']);
      expect(turn).toMatchObject({ kind: 'ran', outcome: 'postponed' });
      // The two it never asked about took no хід, so they head the next chance's order.
      expect(repo.linkOf('mono-1')?.lastAttemptedAtMs).toBeNull();
      expect(repo.linkOf('mono-2')?.lastAttemptedAtMs).toBeNull();
    });

    it('Scenario: A chance that owes the gap sends nothing', async () => {
      const { clientInfo } = linkCards(2);
      rememberCards(2, CHANCE_AT - 10 * MINUTE);
      repo.noteRequest(new Date(CHANCE_AT - 200));
      const bankPorts = bank({ clientInfo: () => ({ status: 200, body: clientInfo }) });

      const turn = await runBackgroundTurn(turnPorts(bankPorts.fetchImpl, { gapMs: MINUTE }));

      expect(bankPorts.requests()).toBe(0);
      expect(turn).toMatchObject({ kind: 'ran', outcome: 'postponed', imported: 0 });
    });

    it('Scenario: A chance starts no timer', async () => {
      const { clientInfo } = linkCards(2);
      rememberCards(2, CHANCE_AT - 10 * MINUTE);
      repo.noteRequest(new Date(CHANCE_AT - 200));
      const bankPorts = bank({ clientInfo: () => ({ status: 200, body: clientInfo }) });
      // Nothing a chance decides may reach a timer. On the owner's phone a fifty-nine-second wait
      // lasted twenty minutes, because Android stops JS timers along with the Activity — and the
      // run held the single-run lock the whole time, so two further chances did nothing at all.
      const scheduled: number[] = [];
      const timeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void, ms?: number) => {
        scheduled.push(ms ?? 0);
        return timeout(fn, ms);
      }) as typeof globalThis.setTimeout;
      try {
        await runBackgroundTurn(turnPorts(bankPorts.fetchImpl, { gapMs: MINUTE }));
      } finally {
        globalThis.setTimeout = timeout;
      }

      expect(scheduled).toEqual([]);
    });

    it('Scenario: Successive chances work through every рахунок', async () => {
      const { clientInfo } = linkCards(3);
      rememberCards(3, CHANCE_AT - 10 * MINUTE);
      const asked: string[] = [];

      for (let chance = 0; chance < 3; chance += 1) {
        // A quarter of an hour apart, as WorkManager gives them — longer than the bank's minute,
        // which is what makes each chance able to send one request. No timer of the app's is
        // involved in that pacing, which is the whole point.
        clockMs = CHANCE_AT + chance * 15 * MINUTE;
        repo.noteRequest(new Date(clockMs - 15 * MINUTE));
        const bankPorts = bank({
          clientInfo: () => ({ status: 200, body: clientInfo }),
          statement: () => ({ status: 200, body: [] }),
        });

        await runBackgroundTurn(turnPorts(bankPorts.fetchImpl, { gapMs: MINUTE }));
        asked.push(...statementsOf(bankPorts.calls));
      }

      // Each chance asked about a different рахунок, in the order of ходи. Three chances cover
      // three рахунки — which is how a phone with nine converges instead of looping on the first.
      expect(asked).toEqual(['mono-0', 'mono-1', 'mono-2']);
    });
  });

});
