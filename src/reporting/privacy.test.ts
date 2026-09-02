import { describe, expect, it } from 'vitest';

import { appendBounded, entryLine, type JournalEntry, type JournalKind } from './journal';
import { renderReport, type BugReport } from './report';

/**
 * What must never reach a репорт про помилку, proven over the rendered text rather than over the
 * shape of a type.
 *
 * The fixture below is a phone with money on it: every назва, every опис and the text of every
 * captured bank сповіщення carries a sentinel that has no business appearing in a file the owner
 * hands to another app, and the monobank token sits beside them carrying its own. Then the app
 * does what it does — opens screens, is refused twice, fails to collect notifications, raises a
 * сповіщення про збій, crashes — and the репорт that comes out is searched for the sentinels.
 *
 * The one exception the design accepts is pinned here rather than described: the app's own refusal
 * text goes into its entry verbatim, and `named-list-repo.ts`'s refusal quotes the назва the owner
 * just typed. So the sentinel is expected **exactly once**, on that one line, and nowhere else. A
 * mapper that ever passed a сума, an опис or a bank's text through would push that count past one
 * and fail this file, whatever the types said.
 *
 * Note what the journal is given for the collection failure: its kind, `collection`, and nothing
 * else. `drainCaptures` returns its failure as a value and the call site journals the kind — which
 * is why no part of a bank's сповіщення can reach an entry even though the failure came from
 * reading one.
 */

const SENTINEL = 'ZZ-SENTINEL-';
const TOKEN = 'ZZ-TOKEN-uXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

/** The phone the репорт is filed from: everything on it is marked, including the token. */
const CARD_NAME = `${SENTINEL}mono black`;
const JAR_NAME = `${SENTINEL}Банка на авто`;
const CATEGORY_NAME = `${SENTINEL}Кафе`;
const CAPTURED_TEXT = `${SENTINEL}Оплата 431.18 UAH, Сільпо, залишок 12345.67`;

const phone = {
  token: TOKEN,
  accounts: [
    { id: 'acc-card', name: CARD_NAME, balanceMinor: 1_234_56 },
    { id: 'acc-jar', name: JAR_NAME, balanceMinor: 90_000_00 },
  ],
  categories: [{ id: 'cat-cafe', name: CATEGORY_NAME }],
  transactions: [
    { id: 'tx-1', description: `${SENTINEL}Сільпо №42`, amountMinor: 431_18 },
    { id: 'tx-2', description: `${SENTINEL}WOG`, amountMinor: 1_100_00 },
  ],
  limits: [{ categoryId: 'cat-cafe', amountMinor: 3_000_00 }],
  captured: [{ app: 'ua.privatbank', text: CAPTURED_TEXT }],
};

let next = 0;
const at = () => new Date(2026, 8, 2, 17, 0, next, 0);

function journalOf(): readonly JournalEntry[] {
  let entries: readonly JournalEntry[] = [];
  const record = (kind: JournalKind, name: string, detail?: string) => {
    next += 1;
    entries = appendBounded(entries, {
      id: `e${next}`,
      at: at(),
      kind,
      name,
      ...(detail === undefined ? {} : { detail }),
    });
  };

  // The owner uses the app: records транзакції, renames a рахунок, sets a ліміт.
  record('screen', '/(tabs)');
  record('screen', '/transaction/new');
  record('screen', '/(tabs)/accounts');
  record('screen', '/account/acc-card');
  record('screen', '/manage/limits');

  // An ordinary refusal: the app's own words, quoting nothing the owner typed.
  record('failure', 'local-save', 'Оберіть рахунок');

  // The refusal that quotes the назва the owner had just typed — the stated exception (design D6).
  const duplicate = `Рахунок «${CARD_NAME}» вже існує`;
  record('failure', 'account-rename', duplicate);

  // The collection of captured bank сповіщення failed. The kind is all that is journaled: the
  // captured text above never gets near an entry.
  record('failure', 'collection', 'Не вдалося зберегти чернетку');
  record('alert', 'collection');

  // And a crash, with the message and stack the platform gave — no money in either.
  record(
    'crash',
    'render',
    'Cannot read properties of undefined (reading "balance")\n  at AccountsScreen\n  at Stack',
  );

  return entries;
}

const journal = journalOf();

const report: BugReport = {
  id: 'r-privacy',
  createdAt: new Date(2026, 8, 2, 17, 5, 0, 0),
  did: 'перейменував рахунок, потім відкрив Рахунки',
  happened: 'застосунок впав',
  expected: 'мав показати рахунки',
  route: '/(tabs)/accounts',
  build: { version: '0.0.0', commit: '3df8103', dirty: false, builtAt: '2026-09-02T14:33:32.747Z' },
  device: { platform: 'android', systemVersion: '16', model: 'Pixel 7' },
  migrationsApplied: 12,
  // Counts only — this is the whole of what the репорт says about how much money is on the phone.
  counts: {
    accounts: phone.accounts.length,
    transactions: phone.transactions.length,
    categories: phone.categories.length,
    rules: 0,
    drafts: phone.captured.length,
  },
  journal,
  // The crash is what prompted this репорт, so the whole-stack section below quotes it and not
  // the refusal — which is what keeps the sentinel to the single occurrence asserted below.
  prompting: journal.find((entry) => entry.kind === 'crash') ?? null,
  screenshots: [],
  handedOverAt: null,
};

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('what a репорт про помилку never carries', () => {
  it('Scenario: The journal carries no money', () => {
    const text = renderReport(report);

    // The exception, and only the exception: the sentinel is in the text exactly once, on the
    // line of the refusal that quoted the назва the owner had just typed.
    expect(occurrences(text, SENTINEL)).toBe(1);
    const quoting = text.split('\n').filter((line) => line.includes(SENTINEL));
    expect(quoting).toHaveLength(1);
    expect(quoting[0]).toContain('account-rename');
    expect(quoting[0]).toContain('вже існує');

    // Every other marked value stays on the phone.
    expect(text).not.toContain(JAR_NAME);
    expect(text).not.toContain(CATEGORY_NAME);
    for (const transaction of phone.transactions) {
      expect(text).not.toContain(transaction.description);
    }
    // No сума of any kind, in minor units or written out.
    for (const amount of ['431', '1234', '90000', '3000', '1100', '12345']) {
      expect(text).not.toContain(amount);
    }
    // And never the token, under any circumstance.
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain('ZZ-TOKEN-');
  });

  it('Scenario: A collection failure carries no bank text', () => {
    const text = renderReport(report);

    const collection = journal.find(
      (entry) => entry.name === 'collection' && entry.kind === 'failure',
    );
    expect(collection).toBeDefined();
    expect(text).toContain(entryLine(collection ?? journal[0]!));

    expect(text).not.toContain(CAPTURED_TEXT);
    expect(text).not.toContain('Сільпо');
    expect(text).not.toContain('431.18');
  });

  it('leaves no field an entry could carry money in', () => {
    // The type-level half of the proof: `JournalEntry` has exactly these keys, so a call site
    // cannot attach a сума, a назва or an опис to an entry even if it wanted to.
    const keys = Object.keys(journal[journal.length - 1] ?? {}).sort();
    expect(keys).toEqual(['at', 'detail', 'id', 'kind', 'name']);
  });
});
