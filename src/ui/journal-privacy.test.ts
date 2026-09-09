import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AuthFetchLike } from '../monobank/api';
import { entryLine, type JournalEntry } from '../reporting/journal';
import { renderReport, type BugReport } from '../reporting/report';
import { drainCaptures } from './notification-drain';
import { bindTestJournal, journal, resetJournalForTests } from './journal';
import { journalProgress } from './monobank-sync';

/**
 * The writer side of the privacy guarantee: not «this entry holds nothing of the owner's» but «the
 * three writers this change adds put nothing of the owner's into one».
 *
 * `src/reporting/privacy.test.ts` proves the value-level half — a `JournalEntry` has no field a
 * сума fits in — over entries a test constructs. That is a proof about the type. This is the proof
 * about the *code*: `watchFetch`, `journalProgress` and `journal.step` are driven for real, over a
 * token, a Drive file id, a чек's реквізити and a bank's notification text, and the журнал they
 * write is then searched for every one of them.
 *
 * It lives beside `src/ui/journal.ts` rather than in `src/reporting/`, because these three writers
 * are `src/ui/`'s and `src/reporting/` is the layer beneath it. Nothing here goes through
 * `src/hooks/monobank-ports.ts`, which imports `AppState` and cannot load under `verify` — the
 * seams are driven directly, which is what the seams exist for.
 */

const TOKEN = 'ZZ-TOKEN-uXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const DRIVE_FILE_ID = 'ZZ-DRIVE-1AbC2dEf3GhI4jKl5MnO';
const RECEIPT_FN = 'ZZ-CHEK-3000000000';
const RECEIPT_SUM = '780.00';
const NOTIFICATION_TEXT = 'ZZ-BANK-Оплата 431.18UAH. Сільпо. Баланс: 12345.67UAH';
const ACCOUNT_NAME = 'ZZ-NAME-mono black';
const DESCRIPTION = 'ZZ-OPYS-Сільпо №42';

/** Everything that must never be found in the журнал, whatever the app did. */
const FORBIDDEN = [
  TOKEN,
  DRIVE_FILE_ID,
  RECEIPT_FN,
  RECEIPT_SUM,
  NOTIFICATION_TEXT,
  ACCOUNT_NAME,
  DESCRIPTION,
  'ZZ-',
];

/** A response the seams answer with. Its body is never read, so what is in it does not matter. */
const answered = (status: number) => ({
  ok: status < 400,
  status,
  json: () => Promise.resolve({ secret: TOKEN }),
  text: () => Promise.resolve(NOTIFICATION_TEXT),
});

const report = (entries: readonly JournalEntry[]): BugReport => ({
  id: 'r1',
  createdAt: new Date(2026, 8, 2, 17, 30),
  did: 'синхронізував картку',
  happened: 'нічого не приїхало',
  expected: 'мали приїхати транзакції',
  route: '/manage/monobank',
  build: { version: '0.0.0', commit: '3df8103', dirty: false, builtAt: '2026-09-02T14:33:32.747Z' },
  device: { platform: 'android', systemVersion: '16', model: 'Pixel 7' },
  migrationsApplied: 22,
  counts: { accounts: 2, transactions: 40, categories: 5, rules: 0, drafts: 1 },
  journal: entries,
  prompting: null,
  screenshots: [],
  handedOverAt: null,
  origin: 'section',
  captureFailure: null,
});

describe('what the app writes into the журнал about its own work', () => {
  let journalOf: () => readonly JournalEntry[];

  beforeEach(() => {
    journalOf = bindTestJournal();
  });
  afterEach(() => resetJournalForTests());

  /** A whole sync run as the app makes one: the requests, the turns, and the run's two ends. */
  async function scriptedSync(): Promise<void> {
    const run = 'run-scripted';
    const bank: AuthFetchLike = journal.watchFetch(
      // The token goes where `api.ts` puts it — in a header — and the seam is handed it.
      (_url: string, _headers: Readonly<Record<string, string>>) => Promise.resolve(answered(200)),
      { run },
    );
    const progress = journalProgress(run);

    await journal.step(
      'monobank-sync',
      async () => {
        progress({ kind: 'started', accounts: 1 });
        await bank('https://api.monobank.ua/personal/client-info', { 'X-Token': TOKEN });
        progress({ kind: 'account', monobankAccountId: 'mono-card', index: 1, of: 1 });
        await bank('https://api.monobank.ua/personal/statement/mono-card/1756000000/1757000000', {
          'X-Token': TOKEN,
        });
        progress({
          kind: 'finished-account',
          result: {
            monobankAccountId: 'mono-card',
            accountId: 'card',
            outcome: 'complete',
            imported: 2,
          },
        });
      },
      { run, ending: () => ({ detail: 'complete', counts: { imported: 2, accounts: 1 } }) },
    );
  }

  /** The other two seams: the owner's Drive, and a чек looked up by its реквізити. */
  async function scriptedRequests(): Promise<void> {
    const drive = journal.watchFetch(
      (_url: string, _init?: { method?: string }) => Promise.resolve(answered(200)),
      { method: (init) => init?.method ?? 'GET' },
    );
    await drive(`https://www.googleapis.com/drive/v3/files/${DRIVE_FILE_ID}?alt=media`, {});
    await drive(`https://www.googleapis.com/drive/v3/files/${DRIVE_FILE_ID}`, { method: 'DELETE' });

    const receipts = journal.watchFetch((_url: string) => Promise.resolve(answered(200)));
    await receipts(
      `https://cabinet.tax.gov.ua/ws/api_public/rro/chkAllWeb?fn=${RECEIPT_FN}&id=12345&date=2026-09-02%2011:30:00&sm=${RECEIPT_SUM}`,
    );
  }

  /** A drain over a bank's own notification text, and a бекап that names what it holds. */
  async function scriptedOperations(): Promise<void> {
    await drainCaptures({
      capture: {
        setWatched: () => Promise.resolve({ kind: 'ok' }),
        collect: () =>
          Promise.resolve([
            {
              packageName: 'ua.privatbank.ap24',
              postedAt: Date.UTC(2026, 8, 2, 9, 30),
              title: 'Оплата',
              text: NOTIFICATION_TEXT,
            },
          ]),
        installedAmong: () => Promise.resolve('unknown' as const),
        acknowledge: () => Promise.resolve(),
      },
      // Nothing is watched, so nothing is stored — the notification is still read, which is the
      // whole point: reading one must not put any of it in the журнал.
      storage: {
        watches: () => [],
        seenFingerprints: () => new Set<string>(),
        commitOutcome: () => undefined,
      },
      rules: () => [],
      newId: () => 'id-1',
      dateOf: () => '2026-09-02' as never,
      now: () => new Date(2026, 8, 2, 12),
    });

    await journal.step('backup-save', () => Promise.resolve('saved'), {
      // What a бекап measured: numbers, over a phone whose рахунок and опис are both marked.
      ending: () => ({ detail: 'saved', counts: { accounts: 2, transactions: 40 } }),
    });
  }

  it('Scenario: No request entry carries the token', async () => {
    await scriptedSync();

    const written = JSON.stringify(journalOf());
    expect(written).not.toContain(TOKEN);
    // Nor any header, nor any part of a response body.
    expect(written).not.toContain('X-Token');
    expect(written).not.toContain('secret');
    // And the run is there all the same — the entries exist, they just carry none of it.
    expect(journalOf().filter((entry) => entry.kind === 'network')).toHaveLength(2);
    expect(journalOf().some((entry) => entry.name.includes('mono-card'))).toBe(true);
  });

  it('Scenario: The journal carries no money, over everything the app did', async () => {
    await scriptedSync();
    await scriptedRequests();
    await scriptedOperations();

    const entries = journalOf();
    const written = JSON.stringify(entries);
    const rendered = renderReport(report(entries));

    for (const forbidden of FORBIDDEN) {
      expect(written, forbidden).not.toContain(forbidden);
      expect(rendered, forbidden).not.toContain(forbidden);
    }
    // The rendered lines are what the owner reads before any of it leaves, so they are swept too.
    for (const line of entries.map(entryLine)) {
      for (const forbidden of FORBIDDEN) {
        expect(line, forbidden).not.toContain(forbidden);
      }
    }
  });

  it('keeps the one identifier the requirement admits, and only that one', async () => {
    await scriptedSync();
    await scriptedRequests();

    const written = JSON.stringify(journalOf());
    // The monobank account the request was about — the question «which card is not syncing» is the
    // reason this whole change exists, and this identifier is the only thing that answers it.
    expect(written).toContain('mono-card');
    // A Drive file id and a чек's реквізити are not that identifier, and neither survives.
    expect(written).not.toContain(DRIVE_FILE_ID);
    expect(written).not.toContain(RECEIPT_FN);
    expect(written).toContain('www.googleapis.com/drive/v3/files/{id}');
    expect(written).toContain('cabinet.tax.gov.ua/ws/api_public/rro/chkAllWeb');
  });

  it('every count it wrote is a number', async () => {
    await scriptedSync();
    await scriptedOperations();

    const values = journalOf().flatMap((entry) => Object.values(entry.counts ?? {}));
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((value) => typeof value === 'number')).toBe(true);
  });
});
