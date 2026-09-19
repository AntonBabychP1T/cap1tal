import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { account, type Account, type AccountKind } from '../domain/account';
import { money, type CurrencyCode, type Money } from '../domain/money';
import {
  refund,
  transfer,
  UNCATEGORISED_CATEGORY_ID,
  type Expense,
  type Income,
  type Refund,
  type Transaction,
} from '../domain/transaction';
import type { MonobankRate } from '../monobank/currency';
import { freshnessLabel, momentLabel } from './dates';
import { homeViewModel, NEVER_SYNCED_LINE, SYNCING_LINE } from './home-screen';
import { lastSyncLine, syncCoverage } from './monobank-screen';

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
  it('Scenario: Income does not switch the primary metric', () => {
    const { status } = model({
      transactions: [income(6_200_000), expense(168_500, 'UAH', 'groceries')],
    });

    expect(status.title).toBe('Витрачено у вересні');
    expect(status.spent).toBe('1 685,00 UAH');
    expect(status.emptyMessage).toBeNull();
  });

  it('Scenario: Currency precision and original currency — two currencies stay apart', () => {
    const { status } = model({
      transactions: [income(500_000), expense(100_000), income(20_000, 'USD'), expense(5_000, 'USD')],
    });

    // Two amounts, in the app's order, joined so neither can be read as a sum of the other.
    expect(status.spent).toBe('1 000,00 UAH · 50,00 USD');
    expect(status.spent).not.toContain('150');
  });

  it('Scenario: Refund-only month remains negative', () => {
    const gotRefund: Refund = refund({
      id: 'r1',
      date: '2026-09-10',
      accountId: 'card',
      amount: money(5_000, 'UAH'),
      categoryId: 'groceries',
    });
    const { status } = model({ transactions: [gotRefund] });

    expect(status.spent).toBe('−50,00 UAH');
    expect(status.emptyMessage).toBeNull();
  });

  it('Scenario: Default expenses and money movements retain their meaning — a jar top-up is not витрачено', () => {
    const { status } = model({
      transactions: [income(5_000_000), expense(200_000, 'UAH', 'groceries'), into('jar', 1_000_000)],
    });

    // Витрачено is the витрата alone — the jar top-up is відкладено, which Головний no longer
    // shows at all (it is one tap away on Місяць).
    expect(status.spent).toBe('2 000,00 UAH');
  });

  it('Scenario: A transfer onto an інвестиційний рахунок is not витрачено either', () => {
    const { status } = model({ transactions: [income(5_000_000), into('bonds', 800_000)] });

    expect(status.spent).toBe('0,00 UAH');
  });

  it('Scenario: Empty and transfer-only months are distinct — no transactions at all', () => {
    const { status } = model({ transactions: [] });

    expect(status.emptyMessage).toBe('Цього місяця ще немає транзакцій.');
    expect(status.spent).toBe('');
  });

  it('Scenario: Empty and transfer-only months are distinct — ordinary transfers alone', () => {
    // Card to card: `classifyTransfer` gives it no bucket at all, so the picture has no currency
    // even though a транзакція is stored — a different situation from no transactions at all.
    const { status } = model({
      transactions: [
        transfer({
          id: 'move',
          date: '2026-09-08',
          fromAccountId: 'card',
          toAccountId: 'usd-card',
          left: money(100_000, 'UAH'),
          arrived: money(2_400, 'USD'),
        }),
      ],
    });

    expect(status.emptyMessage).toBe('Цього місяця лише перекази.');
    expect(status.spent).toBe('');
  });

  it('A month of jar transfers only gets a real spent figure, not the empty message', () => {
    const { status } = model({ transactions: [into('jar', 100_000)] });

    // A jar top-up moves відкладено, so the month has a currency (spent zero) and is not empty.
    expect(status.emptyMessage).toBeNull();
    expect(status.spent).toBe('0,00 UAH');
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

    expect(august.status.title).toBe('Витрачено у серпні');
  });
});

describe('the money held', () => {
  it('Scenario: The total is secondary to the month', () => {
    const { status, held } = model({
      accounts: [card, jar],
      transactions: [income(6_200_000), expense(168_500, 'UAH', 'groceries')],
      balances: balances({ card: money(32_974_800, 'UAH') }),
    });

    expect(status.spent).toBe('1 685,00 UAH');
    expect(held?.line).toBe('329 748,00 UAH');
    expect(held?.approximate).toBeNull();
  });

  it("Scenario: The month's number is not this number", () => {
    const { status, held } = model({
      accounts: [card, jar],
      transactions: [expense(265_000)],
      balances: balances({ card: money(1_305_000, 'UAH') }),
    });

    expect(status.spent).toBe('2 650,00 UAH');
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

describe('operational alerts', () => {
  it('Scenario: A nonzero count of stored uncategorised records is a compact banner', () => {
    const { alerts } = model({ uncategorised: 7 });
    expect(alerts.uncategorisedBanner).toBe('7 транзакцій без категорії · Переглянути');
  });

  it('Scenario: No banner or reserved space at zero', () => {
    const { alerts } = model({ uncategorised: 0 });
    expect(alerts.uncategorisedBanner).toBeNull();
  });

  it('The count is named in the owner’s plural, one and many alike', () => {
    expect(model({ uncategorised: 1 }).alerts.uncategorisedBanner).toBe(
      '1 транзакція без категорії · Переглянути',
    );
    expect(model({ uncategorised: 7 }).alerts.uncategorisedBanner).toBe(
      '7 транзакцій без категорії · Переглянути',
    );
  });

  it('Scenario: Answering the last item removes the banner', () => {
    expect(model({ uncategorised: 1 }).alerts.uncategorisedBanner).not.toBeNull();
    expect(model({ uncategorised: 0 }).alerts.uncategorisedBanner).toBeNull();
  });

  it('Scenario: Fifty drafts stay collapsed — the row names only the count', () => {
    const { alerts } = model({ pendingDrafts: 50 });
    expect(alerts.draftCount).toBe(50);
    expect(alerts.draftLabel).toBe('50 чернеток');
  });

  it('Scenario: No pending чернетки means no draft row', () => {
    const { alerts } = model({ pendingDrafts: 0 });
    expect(alerts.draftCount).toBe(0);
    expect(alerts.draftLabel).toBe('');
  });

  it('The draft label is named in the owner’s plural, one and many alike', () => {
    expect(model({ pendingDrafts: 1 }).alerts.draftLabel).toBe('1 чернетка');
    expect(model({ pendingDrafts: 2 }).alerts.draftLabel).toBe('2 чернетки');
    expect(model({ pendingDrafts: 50 }).alerts.draftLabel).toBe('50 чернеток');
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
    expect(status.slice(0, status.indexOf('</Pressable>'))).toContain(
      'router.push(currentMonthRoute(new Date()))',
    );
  });

  it('Scenario: The month card always opens the current month, never a retained one', () => {
    // The route is built from the device's own clock, not from anything Місяць retained — the
    // same function `home-navigation.test.ts` proves against a retained-month scenario.
    expect(main).toMatch(/import \{[^}]*currentMonthRoute[^}]*\} from '@\/ui\/home-navigation'/);
  });

  it('Scenario: Головний presents the daily dashboard — no money-held card of its own', () => {
    // "Головний opens with how much money there is" / "leads to Рахунки" via that card are both
    // REMOVED requirements, superseded by Статок (task 4.6, not built yet); until then Головний
    // has no rendering of `model.held` at all — the field still exists (it gates the no-account
    // invitation below) but nothing shows its line or its own route to Рахунки.
    expect(main).not.toContain('model.held.line');
    expect(main).not.toContain('На рахунках');
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

  it('Scenario: The uncategorised banner opens only what is waiting', () => {
    // Owner's report, 2026-09-14: the row led to the whole history, not to the транзакції it counts.
    const banner = main.slice(main.indexOf('{model.alerts.uncategorisedBanner ? ('));
    const block = banner.slice(0, banner.indexOf('</Pressable>'));
    expect(block).toMatch(
      /router\.push\(\{\s*pathname: '\/transactions',\s*params: \{ only: ONLY_UNCATEGORISED \},?\s*\}\)/,
    );
    expect(block).not.toContain("router.push('/transactions')");
  });

  it("Scenario: The feed's way to all транзакції is not narrowed", () => {
    expect(main).toContain("action={{ label: 'Усі ›', onPress: () => router.push('/transactions') }}");
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

  it('Scenario: Many drafts do not bury the dashboard — collapsed by default, expanded in place', () => {
    // The draft row toggles local state rather than navigating anywhere; the existing
    // confirm/dismiss ListCard only renders once that state is true, so no draft body — the
    // confirm/dismiss surface `drafts-section.test.ts` already proves — mounts before expansion.
    expect(main).toContain('const [draftsExpanded, setDraftsExpanded] = useState(false)');
    expect(main).toContain('onPress={() => setDraftsExpanded((expanded) => !expanded)}');
    expect(main).toContain('{draftsExpanded && drafts.length > 0 ? (');
  });

  it('Scenario: Ordered default sections — header, month, feed, alerts, in that order', () => {
    // design D1's order: header (freshness + sync), the month card, the feed with its optional
    // banner, then the collapsed operational alerts. No held card and no «Прогрес» section
    // anywhere between them.
    const wordmark = main.indexOf('<Wordmark />');
    const header = main.indexOf('{model.monobank ? (');
    const month = main.indexOf('router.push(currentMonthRoute(new Date()))');
    const invitation = main.indexOf('{model.held === null ? (');
    const banner = main.indexOf('{model.alerts.uncategorisedBanner ? (');
    const feed = main.indexOf('Останні транзакції');
    const alerts = main.indexOf('{model.alerts.draftCount > 0 || model.alerts.failureRow ? (');

    expect(wordmark).toBeGreaterThan(-1);
    expect(header).toBeGreaterThan(wordmark);
    expect(month).toBeGreaterThan(header);
    expect(invitation).toBeGreaterThan(month);
    expect(banner).toBeGreaterThan(invitation);
    expect(feed).toBeGreaterThan(banner);
    expect(alerts).toBeGreaterThan(feed);
  });

  it('Scenario: No large attention section and no entry form remain', () => {
    expect(main).not.toContain('Потребує уваги');
    expect(main).not.toContain('ATTENTION_TITLE');
    expect(main).not.toContain('title="Записати"');
  });
});

describe('how fresh the bank data is', () => {
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const bank = (over: Partial<NonNullable<Parameters<typeof homeViewModel>[0]['monobank']>> = {}) =>
    ({ configured: true, linked: 1, synced: 0, syncing: false, ...over }) as NonNullable<
      Parameters<typeof homeViewModel>[0]['monobank']
    >;

  it('Scenario: Minutes are stated as minutes', () => {
    const view = model({
      monobank: bank({ synced: 1, oldestCompletedAtMs: NOW.getTime() - 3 * MINUTE }),
    });
    expect(view.monobank?.freshness).toBe('оновлено 3 хв тому');
  });

  it('Scenario: Hours are stated as hours', () => {
    const view = model({
      monobank: bank({ synced: 1, oldestCompletedAtMs: NOW.getTime() - 5 * HOUR }),
    });
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
      monobank: bank({ synced: 1, oldestCompletedAtMs: NOW.getTime() - 3 * MINUTE, syncing: true }),
    });
    expect(view.monobank?.freshness).toBe(SYNCING_LINE);
    // ...and once it ends the age is back, now stating the moment it moved to.
    const after = model({
      monobank: bank({ synced: 1, oldestCompletedAtMs: NOW.getTime() - 10_000 }),
    });
    expect(after.monobank?.freshness).toBe('оновлено щойно');
  });

  it("Scenario: The age is the oldest account's, not the newest", () => {
    // Two рахунки, one synced a minute ago and one five hours ago, read through the reducer both
    // screens read. The line dates the picture by its oldest corner: what the owner is looking at
    // is only as fresh as the рахунок that has not been heard from since this morning.
    const links = [
      { monobankAccountId: 'mono-a', accountId: 'a', lastSyncedAtMs: NOW.getTime() - 60_000 },
      { monobankAccountId: 'mono-b', accountId: 'b', lastSyncedAtMs: NOW.getTime() - 5 * HOUR },
    ];
    const coverage = syncCoverage(links);

    const view = model({
      monobank: bank({ ...coverage, oldestCompletedAtMs: coverage.oldestCompletedMs }),
    });

    expect(view.monobank?.freshness).toBe('оновлено 5 год тому');
    expect(view.monobank?.freshness).not.toBe('оновлено щойно');
  });

  it('says the same thing as the monobank screen, over the same links', () => {
    // main-screen: «the same moment the monobank screen states, in shorter words». One reducer
    // answers both, so the day one of them starts filtering differently this fails.
    const cases = [
      [],
      [{ monobankAccountId: 'a', accountId: 'a', lastSyncedAtMs: null }],
      [
        { monobankAccountId: 'a', accountId: 'a', lastSyncedAtMs: NOW.getTime() - HOUR },
        { monobankAccountId: 'b', accountId: 'b', lastSyncedAtMs: null },
      ],
      [
        { monobankAccountId: 'a', accountId: 'a', lastSyncedAtMs: NOW.getTime() - HOUR },
        { monobankAccountId: 'b', accountId: 'b', lastSyncedAtMs: NOW.getTime() - 5 * HOUR },
      ],
    ];

    for (const links of cases) {
      const coverage = syncCoverage(links);
      const screen = lastSyncLine({ links, now: NOW });
      const home = model({
        monobank: bank({ ...coverage, oldestCompletedAtMs: coverage.oldestCompletedMs }),
      }).monobank?.freshness;

      if (links.length === 0) {
        // No link, nothing to miss: neither screen says anything at all.
        expect(screen).toBeNull();
        expect(home).toBeUndefined();
      } else if (coverage.synced === 0) {
        expect(screen).toBe('Синхронізації на цьому пристрої ще не було');
        expect(home).toBe(NEVER_SYNCED_LINE);
      } else if (coverage.oldestCompletedMs === undefined) {
        // The same count, word for word, on both screens.
        expect(home).toBe(screen);
      } else {
        // The same moment: this screen names it, Головний ages it.
        expect(screen).toContain(momentLabel(coverage.oldestCompletedMs, NOW));
        expect(home).toBe(`оновлено ${freshnessLabel(coverage.oldestCompletedMs, NOW)}`);
      }
    }
  });

  it('Scenario: A partly synced bank is stated as a count', () => {
    // Three of nine — the reported bug exactly. An age read off the three that did sync would
    // say «оновлено 3 хв тому» while two thirds of the owner's money was missing from the app.
    const view = model({ monobank: bank({ linked: 9, synced: 3 }) });
    expect(view.monobank?.freshness).toBe('Синхронізовано 3 з 9 рахунків');
    expect(view.monobank?.freshness).not.toContain('оновлено');
  });

  it('Scenario: The count reads as Ukrainian for every number of рахунки', () => {
    // «рахунків» whatever the number: after «з» the noun is the genitive plural, so 3 takes it
    // exactly as 9 does — the nominative «3 рахунки» would be wrong here.
    expect(model({ monobank: bank({ linked: 3, synced: 1 }) }).monobank?.freshness).toBe(
      'Синхронізовано 1 з 3 рахунків',
    );
  });

  it('Scenario: A pull that must wait out the request gap says a sync is going on', () => {
    // The owner pulls within a minute of the last request any run sent, so the run they started
    // sits out the rest of the gap before its first request (`coordinator.test.ts`, «A run started
    // immediately after another waits»). The line must say a sync is going on for the whole of
    // that wait — not an age, and not a count — or the wait would read as the app doing nothing.
    const waiting = model({
      monobank: bank({ linked: 9, synced: 3, syncing: true }),
    });
    expect(waiting.monobank?.freshness).toBe(SYNCING_LINE);

    // The same while a whole-bank age is available: the run in flight outranks the reading.
    const alsoWaiting = model({
      monobank: bank({
        linked: 2,
        synced: 2,
        oldestCompletedAtMs: NOW.getTime() - 5 * HOUR,
        syncing: true,
      }),
    });
    expect(alsoWaiting.monobank?.freshness).toBe(SYNCING_LINE);

    // ...and when the run ends the reading is back.
    const after = model({
      monobank: bank({ linked: 2, synced: 2, oldestCompletedAtMs: NOW.getTime() - 10_000 }),
    });
    expect(after.monobank?.freshness).toBe('оновлено щойно');
  });

  it('Scenario: A failed run does not move the line', () => {
    // The moment is the links', and only a completed account carries one — a run that failed
    // leaves it exactly where it was, two hours old and now two hours and a little.
    const twoHoursAgo = NOW.getTime() - 2 * HOUR;
    const before = model({
      monobank: bank({ synced: 1, oldestCompletedAtMs: twoHoursAgo }),
    });
    const after = model({
      monobank: bank({
        synced: 1,
        oldestCompletedAtMs: twoHoursAgo,
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
    ({ configured: true, linked: 1, synced: 0, syncing: false, ...over }) as NonNullable<
      Parameters<typeof homeViewModel>[0]['monobank']
    >;

  it('Scenario: A rejected token puts the section on the screen', () => {
    const view = model({
      uncategorised: 0,
      pendingDrafts: 0,
      monobank: bank({
        synced: 1,
        oldestCompletedAtMs: NOW.getTime() - HOUR,
        attempt: { attemptedAtMs: NOW.getTime(), outcome: 'invalid-token' },
      }),
    });

    expect(view.alerts.failureRow).toContain('токен');
    // The «Без категорії» banner is untouched by it: it is a third, independent row.
    expect(view.alerts.uncategorisedBanner).toBeNull();
  });

  it('Scenario: A transient failure over fresh data puts nothing there', () => {
    const view = model({
      monobank: bank({
        synced: 1,
        oldestCompletedAtMs: NOW.getTime() - HOUR,
        attempt: { attemptedAtMs: NOW.getTime(), outcome: 'unavailable' },
      }),
    });

    expect(view.alerts.failureRow).toBeNull();
  });

  it('a failure over data that has gone stale does put a row there', () => {
    const view = model({
      monobank: bank({
        synced: 1,
        oldestCompletedAtMs: NOW.getTime() - 30 * HOUR,
        attempt: { attemptedAtMs: NOW.getTime(), outcome: 'unavailable' },
      }),
    });

    expect(view.alerts.failureRow).toContain('не оновлюються');
  });

  it('Scenario: A failing run over a partly synced bank needs the owner', () => {
    // Six of nine have never synced, and the last run ended unavailable. A bank the app has never
    // wholly heard from is not fresh data whatever its best corner says — deciding this from the
    // newest moment is what let one рахунок of nine silence the row entirely.
    const view = model({
      monobank: bank({
        linked: 9,
        synced: 3,
        attempt: { attemptedAtMs: NOW.getTime(), outcome: 'unavailable' },
      }),
    });

    expect(view.alerts.failureRow).toContain('не оновлюються');
  });

  it('Scenario: The monobank row goes when the problem does', () => {
    const failed = model({
      monobank: bank({ attempt: { attemptedAtMs: NOW.getTime(), outcome: 'invalid-token' } }),
    });
    expect(failed.alerts.failureRow).not.toBeNull();

    const fixed = model({
      monobank: bank({
        synced: 1,
        oldestCompletedAtMs: NOW.getTime(),
        attempt: { attemptedAtMs: NOW.getTime(), outcome: 'complete' },
      }),
    });

    expect(fixed.alerts.failureRow).toBeNull();
  });

  it('Scenario: Nothing waiting, no section', () => {
    // The third thing the section can hold is now monobank, so «nothing waiting» has to mean all
    // three: no «Без категорії», no чернетка, and monobank needing nobody.
    const view = model({
      uncategorised: 0,
      pendingDrafts: 0,
      monobank: bank({
        synced: 1,
        oldestCompletedAtMs: NOW.getTime(),
        attempt: { attemptedAtMs: NOW.getTime(), outcome: 'complete' },
      }),
    });

    expect(view.alerts).toEqual({
      uncategorisedBanner: null,
      draftCount: 0,
      draftLabel: '',
      failureRow: null,
    });
  });

  it('says both situations in Ukrainian, naming no сума and no рахунок', () => {
    for (const outcome of ['invalid-token', 'unavailable']) {
      const row = model({
        monobank: bank({ attempt: { attemptedAtMs: NOW.getTime(), outcome } }),
      }).alerts.failureRow;
      expect(row).toMatch(/[а-яїієґ]/i);
      expect(row).not.toMatch(/\d/);
      expect(row).not.toMatch(/UAH|USD|EUR/);
    }
  });

  it('a device with no monobank at all has no row and no section', () => {
    const view = model({ uncategorised: 0, pendingDrafts: 0 });
    expect(view.alerts.failureRow).toBeNull();
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
    // Storage is re-read first and unconditionally; the sync itself is delegated to the tested
    // `manualRefresh`, which is what keeps a device with no token or no link quiet
    // (`home-refresh.test.ts`, "No bank remains quiet").
    expect(body.indexOf('reload()')).toBeLessThan(body.indexOf('manualRefresh('));
    expect(body).toContain('configured: configured === true');
    expect(body).toContain('linkedCount: stored.links.length');
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
    const row = main.slice(main.indexOf('{model.alerts.failureRow ? ('));
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
