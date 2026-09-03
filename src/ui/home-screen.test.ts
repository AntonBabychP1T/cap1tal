import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { account, type Account, type AccountKind } from '../domain/account';
import { money, type CurrencyCode, type Money } from '../domain/money';
import {
  transfer,
  UNCATEGORISED_CATEGORY_ID,
  type Expense,
  type Income,
  type Transaction,
} from '../domain/transaction';
import type { MonobankRate } from '../monobank/currency';
import { homeViewModel, NEVER_SYNCED_LINE, SYNCING_LINE } from './home-screen';

/**
 * What Головний says. The numbers themselves are proven in `monthly-picture.test.ts` and
 * `account-totals.test.ts` — what is proven here is the screen's side of it: which number leads,
 * what carries its reason, that two currencies never become one, and that «Потребує уваги» is
 * absent rather than empty.
 */

const acc = (id: string, kind: AccountKind, currency: CurrencyCode, archived = false): Account =>
  account({ id, name: id, kind, currency, archived });

const card = acc('card', 'spending', 'UAH');
const usdCard = acc('usd-card', 'spending', 'USD');
const jar = acc('jar', 'savings', 'UAH');
const bonds = acc('bonds', 'investment', 'UAH');
const accounts = [card, usdCard, jar, bonds];

const USD_RATE: MonobankRate = { currency: 'USD', rateMillionths: 41_250_000 };

let n = 0;
const nextId = () => `t${(n += 1)}`;

const expense = (
  amount: number,
  currency: CurrencyCode = 'UAH',
  categoryId = UNCATEGORISED_CATEGORY_ID,
): Expense => ({
  type: 'expense',
  id: nextId(),
  date: '2026-09-10',
  accountId: currency === 'USD' ? 'usd-card' : 'card',
  amount: money(amount, currency),
  categoryId,
});

const income = (amount: number, currency: CurrencyCode = 'UAH'): Income => ({
  type: 'income',
  id: nextId(),
  date: '2026-09-05',
  accountId: currency === 'USD' ? 'usd-card' : 'card',
  amount: money(amount, currency),
  sourceId: 'salary',
});

const into = (toAccountId: string, amount: number): Transaction =>
  transfer({
    id: nextId(),
    date: '2026-09-08',
    fromAccountId: 'card',
    toAccountId,
    left: money(amount, 'UAH'),
    arrived: money(amount, 'UAH'),
  });

const balances = (entries: Record<string, Money>): ReadonlyMap<string, Money> =>
  new Map(Object.entries(entries));

/** The moment every test below is read against; every clock in this app is passed in. */
const NOW = new Date('2026-09-02T12:00:00');

const model = (input: {
  transactions?: readonly Transaction[];
  balances?: ReadonlyMap<string, Money>;
  rates?: readonly MonobankRate[];
  uncategorised?: number;
  pendingDrafts?: number;
  accounts?: readonly Account[];
  monobank?: Parameters<typeof homeViewModel>[0]['monobank'];
  now?: Date;
}) =>
  homeViewModel({
    month: '2026-09',
    accounts: input.accounts ?? accounts,
    transactions: input.transactions ?? [],
    balances: input.balances ?? new Map(),
    rates: input.rates ?? [],
    uncategorised: input.uncategorised ?? 0,
    pendingDrafts: input.pendingDrafts ?? 0,
    ...(input.monobank ? { monobank: input.monobank } : {}),
    now: input.now ?? NOW,
  });

describe('the month status', () => {
  it("Scenario: The month's залишилось is the first thing on the screen", () => {
    const { status } = model({
      transactions: [income(6_200_000), expense(168_500, 'UAH', 'groceries')],
    });

    expect(status.title).toBe('Залишилось у вересні');
    expect(status.left).toBe('60 315,00 UAH');
    expect(status.spentLabel).toBe('Витрачено');
    expect(status.spent).toBe('1 685,00 UAH');
    expect(status.note).toBeNull();
    expect(status.emptyMessage).toBeNull();
  });

  it('Scenario: Two currencies stay apart', () => {
    const { status } = model({
      transactions: [income(500_000), expense(100_000), income(20_000, 'USD'), expense(5_000, 'USD')],
    });

    // Two amounts, in the app's order, joined so neither can be read as a sum of the other.
    expect(status.left).toBe('4 000,00 UAH · 150,00 USD');
    expect(status.spent).toBe('1 000,00 UAH · 50,00 USD');
    expect(status.left).not.toContain('4150');
  });

  it('Scenario: A month before its first дохід says why залишилось is negative', () => {
    const { status } = model({ transactions: [expense(265_000)] });

    expect(status.left).toBe('−2 650,00 UAH');
    expect(status.note).toBe('У цьому місяці ще не записано дохід.');
  });

  it('Scenario: The currency without дохід is the one named', () => {
    const { status } = model({
      transactions: [income(500_000), expense(100_000), expense(7_000, 'USD')],
    });

    expect(status.note).toBe('У цьому місяці ще не записано дохід у USD.');
    expect(status.left).toBe('4 000,00 UAH · −70,00 USD');
  });

  it('Both currencies without дохід are both named', () => {
    const { status } = model({ transactions: [expense(100_000), expense(7_000, 'USD')] });

    expect(status.note).toBe('У цьому місяці ще не записано дохід у UAH і USD.');
  });

  it('Scenario: Money moved into a jar is missing from neither number', () => {
    const { status } = model({
      transactions: [income(5_000_000), expense(200_000, 'UAH', 'groceries'), into('jar', 1_000_000)],
    });

    // Витрачено is the витрата alone; залишилось already has the jar top-up out of it as
    // відкладено, which Місяць names and Головний does not.
    expect(status.spent).toBe('2 000,00 UAH');
    expect(status.left).toBe('38 000,00 UAH');
  });

  it('Scenario: A transfer onto an інвестиційний рахунок is not витрачено either', () => {
    const { status } = model({ transactions: [income(5_000_000), into('bonds', 800_000)] });

    expect(status.spent).toBe('0,00 UAH');
    expect(status.left).toBe('42 000,00 UAH');
  });

  it('Scenario: An empty month says it is empty', () => {
    const { status } = model({ transactions: [] });

    expect(status.emptyMessage).toBe('У цьому місяці ще нічого не записано.');
    expect(status.left).toBe('');
    expect(status.spent).toBe('');
  });

  it('A month of transfers only gets its own sentence, not the empty one', () => {
    const { status } = model({ transactions: [into('jar', 100_000)] });

    // A jar top-up moves відкладено, so the month has a currency and is not empty at all.
    expect(status.emptyMessage).toBeNull();
    expect(status.left).toBe('−1 000,00 UAH');
  });

  it('The title is the month it is about, not the one the tests were written in', () => {
    const august = homeViewModel({
      month: '2026-08',
      accounts,
      transactions: [],
      balances: new Map(),
      rates: [],
      uncategorised: 0,
      pendingDrafts: 0,
      now: NOW,
    });

    expect(august.status.title).toBe('Залишилось у серпні');
  });
});

describe('the money held', () => {
  it('Scenario: The total is secondary to the month', () => {
    const { status, held } = model({
      accounts: [card, jar],
      transactions: [income(6_200_000), expense(168_500, 'UAH', 'groceries')],
      balances: balances({ card: money(32_974_800, 'UAH') }),
    });

    expect(status.left).toBe('60 315,00 UAH');
    expect(held?.line).toBe('329 748,00 UAH');
    expect(held?.approximate).toBeNull();
  });

  it("Scenario: The month's number is not this number", () => {
    const { status, held } = model({
      accounts: [card, jar],
      transactions: [expense(265_000)],
      balances: balances({ card: money(1_305_000, 'UAH') }),
    });

    expect(status.left).toBe('−2 650,00 UAH');
    expect(held?.line).toBe('13 050,00 UAH');
  });

  it('Scenario: Two currencies read as two amounts', () => {
    const { held } = model({
      balances: balances({ card: money(32_974_800, 'UAH'), 'usd-card': money(70_000, 'USD') }),
      rates: [USD_RATE],
    });

    expect(held?.line).toBe('329 748,00 UAH · 700,00 USD');
    expect(held?.approximate).toBe('≈ 358 623,00 грн');
  });

  it('An unknown rate withholds the approximation and nothing else', () => {
    const { held } = model({
      balances: balances({ card: money(32_974_800, 'UAH'), 'usd-card': money(70_000, 'USD') }),
      rates: [],
    });

    expect(held?.line).toBe('329 748,00 UAH · 700,00 USD');
    expect(held?.approximate).toBeNull();
  });

  it('Scenario: An empty device shows no total', () => {
    expect(model({ accounts: [] }).held).toBeNull();
  });

  it('Scenario: Every рахунок archived is the same case', () => {
    const archived = [acc('card', 'spending', 'UAH', true)];

    expect(model({ accounts: archived, balances: balances({ card: money(1_000, 'UAH') }) }).held)
      .toBeNull();
  });
});

describe('«Потребує уваги»', () => {
  it('Scenario: Nothing waiting, no section', () => {
    const { attention } = model({ uncategorised: 0, pendingDrafts: 0 });

    expect(attention.present).toBe(false);
    expect(attention.rows).toEqual([]);
  });

  it('Scenario: Uncategorised транзакції are named and counted', () => {
    const { attention } = model({ uncategorised: 2 });

    expect(attention.present).toBe(true);
    expect(attention.rows).toEqual(['2 транзакції без категорії']);
  });

  it('The count is named in the owner’s plural, one and many alike', () => {
    expect(model({ uncategorised: 1 }).attention.rows).toEqual(['1 транзакція без категорії']);
    expect(model({ uncategorised: 7 }).attention.rows).toEqual(['7 транзакцій без категорії']);
  });

  it('Scenario: A pending чернетка puts the section on the screen', () => {
    const { attention } = model({ uncategorised: 0, pendingDrafts: 1 });

    // The чернетки are the screen's own block: the section exists for them, and counts nothing.
    expect(attention.present).toBe(true);
    expect(attention.rows).toEqual([]);
  });

  it('Scenario: Answering the last item takes the section away', () => {
    // The чернетка confirmed into a категорія its правило matched: nothing counted, nothing
    // pending, and the section is gone rather than standing empty.
    expect(model({ uncategorised: 0, pendingDrafts: 1 }).attention.present).toBe(true);
    expect(model({ uncategorised: 0, pendingDrafts: 0 }).attention.present).toBe(false);
  });

  it('Scenario: A чернетка confirmed into «Без категорії» keeps the section', () => {
    // The other confirmation: no правило matched, so the чернетка left the pending surface and
    // arrived as a витрата without a категорія — one thing waiting replaced by another.
    const after = model({ uncategorised: 1, pendingDrafts: 0 });

    expect(after.attention.present).toBe(true);
    expect(after.attention.rows).toEqual(['1 транзакція без категорії']);
  });

  it('Scenario: Categorising from the feed lowers the count', () => {
    expect(model({ uncategorised: 3 }).attention.rows).toEqual(['3 транзакції без категорії']);
    expect(model({ uncategorised: 2 }).attention.rows).toEqual(['2 транзакції без категорії']);
  });
});

/**
 * The screen's own wiring, which `verify` never renders: what Головний holds, what it no longer
 * holds, and where each of its four taps goes. Structural, like the assertions in
 * `entry-form.test.ts` — the alternative is a requirement nothing checks at all.
 */
describe('Головний as the overview', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const main = source('../app/(tabs)/index.tsx');
  /** The offer to the whole history, as the section heading carries it. */
  const FEED_OFFER = "action={{ label: 'Усі ›', onPress: () => router.push('/transactions') }}";

  it('Scenario: Головний holds no form of its own', () => {
    // The form's own controls, gone from the screen's content: nothing to scroll past.
    expect(main).not.toContain("title=\"Записати\"");
    expect(main).not.toContain("label=\"Тип\"");
    expect(main).not.toContain("label=\"Категорія\" choices={categoryPicks}");
    // The one сума field left on the screen belongs to a raw чернетка, which has no сума of its
    // own and confirms only with one the owner supplies — not to an entry form.
    const sumaFields = [...main.matchAll(/label="Сума"/g)];
    expect(sumaFields).toHaveLength(1);
    expect(main.indexOf('label="Сума"')).toBeGreaterThan(main.indexOf('line.needsAmount ? ('));
    expect(main).not.toContain('buildEntry(');
    expect(main).not.toContain('askAboutTransfer(');
    expect(main).not.toContain('entryDefaultsRepo');
  });

  it('Scenario: The «+» opens the form', () => {
    expect(main).toContain("overlay={<Fab onPress={() => router.push('/transaction/new')} />}");
  });

  it('Scenario: The status leads to Місяць', () => {
    const status = main.slice(main.indexOf('{/* The month first'));
    expect(status.slice(0, status.indexOf('</Pressable>'))).toContain("router.push('/month')");
  });

  it('Scenario: The total leads to Рахунки', () => {
    const held = main.slice(main.indexOf('{model.held ? ('));
    const card = held.slice(0, held.indexOf('</Pressable>'));

    expect(card).toContain("router.push('/accounts')");
    // Under its own name and in its own card, so it can never be read as the month's number: the
    // status wears `type="title"`, this wears the reading size.
    expect(card).toContain('На рахунках');
    expect(card).toContain('{model.held.line}');
    expect(card).not.toContain('type="title"');
    expect(main.slice(0, main.indexOf('{model.held ? ('))).toContain('type="title"');
  });

  it('Scenario: The section stops at five', () => {
    expect(main).toContain('const FEED_SIZE = 5;');
    expect(main).toContain('transactionsRepo.listLatest(FEED_SIZE)');
  });

  it('Scenario: The whole history is one tap from the feed', () => {
    expect(main).toContain('Останні транзакції');
    // The way out sits in the section's own heading, beside the note that says what is shown.
    expect(main).toContain(FEED_OFFER);
    expect(main).toContain('note={`останні ${FEED_SIZE}`}');
  });

  it('Scenario: The way there does not depend on having a long history', () => {
    // The offer stands outside the branch that says nothing is recorded yet, so an empty history
    // and a long one both reach «Транзакції» the same way.
    const empty = main.indexOf('{stored.feed.length === 0 ? (');
    const offer = main.indexOf(FEED_OFFER);
    expect(offer).toBeGreaterThan(-1);
    expect(offer).toBeLessThan(empty);
  });

  it('Scenario: What was recorded is on Головний when the owner returns', () => {
    // Returning from the entry screen is a navigation focus, and the стрічка is re-read on it.
    expect(main).toContain('useReloadOnFocus(');
    expect(main).toContain('feed: transactionsRepo.listLatest(FEED_SIZE)');
  });

  it('Scenario: A back-dated транзакція takes its own place', () => {
    // The screen adds no order of its own: it renders `listLatest` in the order it comes back —
    // by date, then by recording recency (proven in `transactions-repo.test.ts`, "The latest
    // listing is newest first"). So today's транзакція stands first and one dated a week ago
    // stands where its date puts it, without the screen deciding anything.
    expect(main).toContain('feed: transactionsRepo.listLatest(FEED_SIZE)');
    expect(main).toContain('stored.feed.map((t, index) =>');
    expect(main).not.toContain('stored.feed.sort');
    expect(main).not.toContain('[...stored.feed]');
  });

  it('The counted «Без категорії» row leads where those транзакції are marked', () => {
    const attention = main.slice(main.indexOf('{model.attention.rows.length > 0 |'));
    expect(attention.slice(0, attention.indexOf('</ListCard>'))).toContain(
      "router.push('/transactions')",
    );
  });

  it('Scenario: With no рахунок the screen says so and still shows what is stored', () => {
    const invitation = main.slice(main.indexOf('{model.held === null ? ('));
    const guarded = invitation.slice(0, invitation.indexOf(') : null}'));

    // What the screen says instead of a total, and where it leads.
    expect(guarded).toContain('Спершу створіть рахунок');
    expect(guarded).toContain('title="До Рахунків"');
    expect(guarded).toContain("router.push('/accounts')");

    // And what it does not swallow: the latest транзакції stand outside that branch, so a device
    // whose every рахунок is archived still shows what is stored.
    expect(guarded).not.toContain('Останні транзакції');
    expect(guarded).not.toContain('stored.feed.map(');
    expect(main.indexOf('Останні транзакції')).toBeGreaterThan(
      main.indexOf('{model.held === null ? ('),
    );
  });

  it('No number is computed on the screen — it reads the tested model', () => {
    expect(main).toContain('homeViewModel({');
    expect(main).not.toContain('monthlyPicture(');
    expect(main).not.toContain('accountTotals(');
    expect(main).not.toContain('approximateTotals(');
  });
});

describe('how fresh the bank data is', () => {
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const bank = (over: Partial<NonNullable<Parameters<typeof homeViewModel>[0]['monobank']>> = {}) =>
    ({ configured: true, linked: 1, syncing: false, ...over }) as NonNullable<
      Parameters<typeof homeViewModel>[0]['monobank']
    >;

  it('Scenario: Minutes are stated as minutes', () => {
    const view = model({ monobank: bank({ lastCompletedAtMs: NOW.getTime() - 3 * MINUTE }) });
    expect(view.monobank?.freshness).toBe('оновлено 3 хв тому');
  });

  it('Scenario: Hours are stated as hours', () => {
    const view = model({ monobank: bank({ lastCompletedAtMs: NOW.getTime() - 5 * HOUR }) });
    expect(view.monobank?.freshness).toBe('оновлено 5 год тому');
  });

  it('Scenario: A linked bank that has never synced says so', () => {
    // No moment at all is not «оновлено щойно» and not an empty age: it is its own sentence.
    const view = model({ monobank: bank() });
    expect(view.monobank?.freshness).toBe(NEVER_SYNCED_LINE);
    expect(view.monobank?.freshness).not.toContain('оновлено');
  });

  it('Scenario: Without monobank there is no line', () => {
    // Never connected...
    expect(model({}).monobank).toBeNull();
    expect(model({ monobank: bank({ configured: false }) }).monobank).toBeNull();
    // ...and connected with nothing linked: a token alone syncs nothing, so it says nothing.
    expect(model({ monobank: bank({ linked: 0 }) }).monobank).toBeNull();
  });

  it('Scenario: A run in flight is what the line says', () => {
    const view = model({
      monobank: bank({ lastCompletedAtMs: NOW.getTime() - 3 * MINUTE, syncing: true }),
    });
    expect(view.monobank?.freshness).toBe(SYNCING_LINE);
    // ...and once it ends the age is back, now stating the moment it moved to.
    const after = model({ monobank: bank({ lastCompletedAtMs: NOW.getTime() - 10_000 }) });
    expect(after.monobank?.freshness).toBe('оновлено щойно');
  });

  it('Scenario: A failed run does not move the line', () => {
    // The moment is the links', and only a completed account carries one — a run that failed
    // leaves it exactly where it was, two hours old and now two hours and a little.
    const twoHoursAgo = NOW.getTime() - 2 * HOUR;
    const before = model({ monobank: bank({ lastCompletedAtMs: twoHoursAgo }) });
    const after = model({
      monobank: bank({
        lastCompletedAtMs: twoHoursAgo,
        attempt: { attemptedAtMs: NOW.getTime(), outcome: 'unavailable' },
      }),
    });
    expect(before.monobank?.freshness).toBe('оновлено 2 год тому');
    expect(after.monobank?.freshness).toBe('оновлено 2 год тому');
  });
});

describe('monobank among what needs attention', () => {
  const HOUR = 60 * 60_000;
  const bank = (over: Partial<NonNullable<Parameters<typeof homeViewModel>[0]['monobank']>> = {}) =>
    ({ configured: true, linked: 1, syncing: false, ...over }) as NonNullable<
      Parameters<typeof homeViewModel>[0]['monobank']
    >;

  it('Scenario: A rejected token puts the section on the screen', () => {
    const view = model({
      uncategorised: 0,
      pendingDrafts: 0,
      monobank: bank({
        lastCompletedAtMs: NOW.getTime() - HOUR,
        attempt: { attemptedAtMs: NOW.getTime(), outcome: 'invalid-token' },
      }),
    });

    expect(view.attention.present).toBe(true);
    expect(view.attention.monobank).toContain('токен');
    // The «Без категорії» rows are untouched by it: it is a third kind of row, not one of those.
    expect(view.attention.rows).toEqual([]);
  });

  it('Scenario: A transient failure over fresh data puts nothing there', () => {
    const view = model({
      monobank: bank({
        lastCompletedAtMs: NOW.getTime() - HOUR,
        attempt: { attemptedAtMs: NOW.getTime(), outcome: 'unavailable' },
      }),
    });

    expect(view.attention.monobank).toBeNull();
    expect(view.attention.present).toBe(false);
  });

  it('a failure over data that has gone stale does put a row there', () => {
    const view = model({
      monobank: bank({
        lastCompletedAtMs: NOW.getTime() - 30 * HOUR,
        attempt: { attemptedAtMs: NOW.getTime(), outcome: 'unavailable' },
      }),
    });

    expect(view.attention.monobank).toContain('не оновлюються');
    expect(view.attention.present).toBe(true);
  });

  it('Scenario: The monobank row goes when the problem does', () => {
    const failed = model({
      monobank: bank({ attempt: { attemptedAtMs: NOW.getTime(), outcome: 'invalid-token' } }),
    });
    expect(failed.attention.present).toBe(true);

    const fixed = model({
      monobank: bank({
        lastCompletedAtMs: NOW.getTime(),
        attempt: { attemptedAtMs: NOW.getTime(), outcome: 'complete' },
      }),
    });

    expect(fixed.attention.monobank).toBeNull();
    // Nothing else was waiting, so the section is gone with the row.
    expect(fixed.attention.present).toBe(false);
  });

  it('Scenario: Nothing waiting, no section', () => {
    // The third thing the section can hold is now monobank, so «nothing waiting» has to mean all
    // three: no «Без категорії», no чернетка, and monobank needing nobody.
    const view = model({
      uncategorised: 0,
      pendingDrafts: 0,
      monobank: bank({
        lastCompletedAtMs: NOW.getTime(),
        attempt: { attemptedAtMs: NOW.getTime(), outcome: 'complete' },
      }),
    });

    expect(view.attention).toEqual({ rows: [], monobank: null, present: false });
  });

  it('says both situations in Ukrainian, naming no сума and no рахунок', () => {
    for (const outcome of ['invalid-token', 'unavailable']) {
      const row = model({
        monobank: bank({ attempt: { attemptedAtMs: NOW.getTime(), outcome } }),
      }).attention.monobank;
      expect(row).toMatch(/[а-яїієґ]/i);
      expect(row).not.toMatch(/\d/);
      expect(row).not.toMatch(/UAH|USD|EUR/);
    }
  });

  it('a device with no monobank at all has no row and no section', () => {
    const view = model({ uncategorised: 0, pendingDrafts: 0 });
    expect(view.attention.monobank).toBeNull();
    expect(view.attention.present).toBe(false);
  });
});

describe('what Головний itself wires', () => {
  const main = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');

  it('Scenario: A run that begins while Головний is open reaches the line', () => {
    // Subscribed, not read during render: neither opening the app nor coming back to it is a
    // navigation focus, so a run started by the shell would otherwise never reach this screen.
    expect(main).toContain('onSyncState(');
    expect(main).toContain('setSyncing(syncInFlight())');
    // The same signal re-reads storage, which is how транзакції a run imported appear in the
    // стрічка without the owner leaving Головний.
    const at = main.indexOf('onSyncState(');
    expect(main.slice(at, at + 200)).toContain('reload()');
  });

  it('Scenario: A pull inside the quiet interval still syncs', () => {
    // The pull calls the entry point directly and never consults `syncDue`: the interval governs
    // only the runs the owner did not ask for, and a pull is one they did.
    expect(main).toContain('startSync(');
    expect(main).not.toContain('syncDue(');
  });

  it('Scenario: A pull without monobank changes nothing but the reading', () => {
    const pull = main.slice(main.indexOf('const pull = useCallback'));
    const body = pull.slice(0, pull.indexOf('}, ['));
    // Storage is re-read first and unconditionally; the sync is behind the two conditions, so a
    // device with no token or no link sends nothing and refuses nothing.
    expect(body.indexOf('reload()')).toBeLessThan(body.indexOf('startSync('));
    expect(body).toContain("configured !== true || stored.links.length === 0");
    expect(body).toContain('return;');
  });

  it('the spinner is bound to the run, so it ends when the run does', () => {
    const pull = main.slice(main.indexOf('const pull = useCallback'));
    const body = pull.slice(0, pull.indexOf('}, ['));
    expect(body).toContain('setPulling(true)');
    // In a `finally`, so a run that ends by failing still stops the spinner.
    expect(body).toContain('finally');
    expect(body).toContain('setPulling(false)');
    expect(main).toContain('refreshing={pulling}');
  });

  it('the freshness line is drawn only when the view model has one', () => {
    expect(main).toContain('{model.monobank ? (');
    expect(main).toContain('{model.monobank.freshness}');
  });

  it('the monobank row leads to the monobank screen and nowhere else', () => {
    const row = main.slice(main.indexOf('{model.attention.monobank ? ('));
    expect(row.slice(0, row.indexOf('</View>'))).toContain("router.push('/manage/monobank')");
  });

  it('nothing on this screen reads the token beyond whether one is kept', () => {
    // `configured` is a boolean derived at the read; the value itself never lands in state, in a
    // prop or in the view model.
    expect(main).toContain('setConfigured(read.kind === \'ok\' && Boolean(read.token))');
    expect(main).not.toContain('setConfigured(read.token');
    expect(main.match(/read\.token/g)).toHaveLength(1);
  });
});
