import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Category, Source } from '../domain/category';
import { account } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault, UNCATEGORISED_CATEGORY_ID, type Transaction } from '../domain/transaction';
import { accountsRepo } from '../db/accounts-repo';
import { storageStamp } from '../db/stamp';
import {
  countingDb,
  openFileDb,
  openTestDb,
  seedReferences,
  type TestDb,
  type TestStorage,
} from '../db/test-db';
import { transactionsRepo } from '../db/transactions-repo';
import { feedTitle, transactionLine } from './transaction-line';
import {
  monthFromRoute,
  emptyMessage,
  PAGE_SIZE,
  searchCriteria,
  searchLineTitle,
  showMore,
  uncategorisedFromRoute,
  accountFilterOrder,
  firstPage,
  nextPage,
  rereadPages,
  searchDelayMs,
  SEARCH_PAUSE_MS,
  type PagePorts,
} from './transaction-search';

const categories: readonly Category[] = [
  { id: 'groceries', name: 'Продукти', archived: false },
  { id: 'post', name: 'Пошта', archived: false },
  { id: 'pets', name: 'Тварини', archived: true },
];

const sources: readonly Source[] = [
  { id: 'salary', name: 'Зарплата', archived: false },
  { id: 'gifts', name: 'Подарунки', archived: false },
];

describe('searchCriteria', () => {
  it('Scenario: The bank"s text finds the транзакція', () => {
    const criteria = searchCriteria('сільпо', categories, sources);

    // The text travels as typed; the repository is what folds it against each опис.
    expect(criteria?.text).toBe('сільпо');
    expect(criteria?.categoryIds).toEqual([]);
    expect(criteria?.sourceIds).toEqual([]);
  });

  it('Scenario: A категорія is found by its name', () => {
    const criteria = searchCriteria('прод', categories, sources);

    expect(criteria?.categoryIds).toEqual(['groceries']);
  });

  it('Scenario: A сума is found as typed', () => {
    // «1200» is 1200,00 in major units — 120000 minor — and names no currency.
    expect(searchCriteria('1200', categories, sources)?.amountMinor).toBe(120000);
    expect(searchCriteria('12,50', categories, sources)?.amountMinor).toBe(1250);
  });

  it('What is not a сума simply is not one', () => {
    const criteria = searchCriteria('сільпо', categories, sources);

    expect(criteria).not.toHaveProperty('amountMinor');
    // And the text still searches описи and names.
    expect(criteria?.text).toBe('сільпо');
  });

  it('Scenario: An empty search shows the history', () => {
    expect(searchCriteria('', categories, sources)).toBeUndefined();
    expect(searchCriteria('   ', categories, sources)).toBeUndefined();
  });

  it('An archived категорія is still searchable — its транзакції still carry it', () => {
    expect(searchCriteria('тварин', categories, sources)?.categoryIds).toEqual(['pets']);
  });

  it('A джерело is found by its name', () => {
    expect(searchCriteria('подар', categories, sources)?.sourceIds).toEqual(['gifts']);
  });

  it('Letter case does not matter, the way Ukrainian folds it', () => {
    expect(searchCriteria('ПОШТА', categories, sources)?.categoryIds).toEqual(['post']);
  });

  it('Scenario: A транзакція matching twice is shown once', () => {
    // The criterion names both routes; the repository returns one row, never two.
    const criteria = searchCriteria('пошта', categories, sources);

    expect(criteria?.text).toBe('пошта');
    expect(criteria?.categoryIds).toEqual(['post']);
  });

  it('The typed text is carried trimmed', () => {
    expect(searchCriteria('  сільпо  ', categories, sources)?.text).toBe('сільпо');
  });
});

describe('showMore', () => {
  const spent = (id: string): Transaction => ({
    type: 'expense',
    id,
    date: '2026-03-10',
    accountId: 'card',
    amount: money(1000, 'UAH'),
    categoryId: 'groceries',
  });
  const stored = Array.from({ length: 7 }, (_, index) => spent(`e${index}`));
  const read = (limit: number, offset: number) => stored.slice(offset, offset + limit);

  it('Scenario: The history continues past the feed"s ceiling', () => {
    const first = showMore([], read, 3);

    expect(first.transactions.map((t) => t.id)).toEqual(['e0', 'e1', 'e2']);
    expect(first.more).toBe(true);
  });

  it('Scenario: Showing more keeps what is already shown', () => {
    const first = showMore([], read, 3);
    const second = showMore(first.transactions, read, 3);

    // What was on the screen stays where it was, and the next ones follow in the same order.
    expect(second.transactions.map((t) => t.id)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4', 'e5']);
    expect(second.more).toBe(true);
  });

  it('Reaching the end is plain, and no more is claimed than there is', () => {
    const third = showMore(showMore(showMore([], read, 3).transactions, read, 3).transactions, read, 3);

    expect(third.transactions).toHaveLength(7);
    expect(third.more).toBe(false);
  });

  it('An exact multiple of a page does not claim there is more', () => {
    const exact = Array.from({ length: 6 }, (_, index) => spent(`x${index}`));
    const readExact = (limit: number, offset: number) => exact.slice(offset, offset + limit);

    const second = showMore(showMore([], readExact, 3).transactions, readExact, 3);

    expect(second.transactions).toHaveLength(6);
    expect(second.more).toBe(false);
  });

  it('Scenario: An empty history says so', () => {
    const empty = showMore([], () => [], 3);

    expect(empty.transactions).toEqual([]);
    expect(empty.more).toBe(false);
  });

  it('A page has a size, and it is the one the screen starts with', () => {
    let asked = 0;
    showMore([], (limit) => {
      asked = limit;
      return [];
    });

    // One beyond a page, so «є ще» is knowledge and not a guess.
    expect(asked).toBe(PAGE_SIZE + 1);
  });
});

describe('emptyMessage', () => {
  it('Scenario: An empty history says so', () => {
    expect(emptyMessage({ shown: 0, narrowed: false })).toBe('Ще нічого не записано.');
  });

  it('Scenario: Nothing found is said, not hidden', () => {
    expect(emptyMessage({ shown: 0, narrowed: true })).toContain('Нічого не знайдено');
  });

  it('A list needs no sentence in its place', () => {
    expect(emptyMessage({ shown: 3, narrowed: true })).toBeNull();
    expect(emptyMessage({ shown: 3, narrowed: false })).toBeNull();
  });
});

/**
 * The rows «Транзакції» shows are storage's, and it must ask storage again whenever it comes back
 * into focus. `verify` never runs a screen, so the assertion is structural — the idiom
 * `entry-form.test.ts` already uses on Головний.
 */
describe('the shown list follows storage', () => {
  const screen = readFileSync(new URL('../app/transactions.tsx', import.meta.url), 'utf8');

  it('Scenario: A found транзакція is edited', () => {
    // Not a `useMemo`: with an empty query — the screen's own default — `searchCriteria('')` is
    // `undefined` on both sides of a focus reload, so a memo keeps the page it computed at mount
    // and the edited транзакція reads as it was.
    // Since app-speed-pass the pages live in `usePagedList`, which re-reads every row shown on each
    // focus after the first and after the screen's own writes (design D6).
    expect(screen).toContain('const [shown, showNext, reload] = usePagedList(');
    expect(screen).not.toMatch(/const shown = useMemo\(/);
    const hook = readFileSync(new URL('../hooks/use-paged-list.ts', import.meta.url), 'utf8');
    expect(hook).toMatch(/useFocusEffect\([\s\S]*?reload\(\)/);
    expect(hook).toContain('rereadPages(shown, reading)');
  });

  it('The рахунок, категорія and місяць it reads beside them are re-read too', () => {
    expect(screen).toMatch(/const \[stored(, reloadStored)?\] = useReloadOnFocus\(/);
  });
});

describe('the місяць a route may ask for', () => {
  it('opens narrowed to the місяць «Закрий <місяць>» is about', () => {
    expect(monthFromRoute('2026-08')).toBe('2026-08');
  });

  it('narrows nothing when the route asks for nothing', () => {
    expect(monthFromRoute(undefined)).toBeUndefined();
    expect(monthFromRoute('')).toBeUndefined();
  });

  it('is an initial value and not a lock', () => {
    // The scenario's other half: the narrowing shows the місяць and the owner can widen it back.
    // That lives in the screen, so it is read from the screen — `useState`, not a prop, and the
    // same `setMonth` the picker below it calls.
    const screen = readFileSync(new URL('../app/transactions.tsx', import.meta.url), 'utf8');

    expect(screen).toMatch(/const \[month, setMonth\] = useState\(monthFromRoute\(asked\) \?\? ANY\)/);
    // The picker still writes it, so the route's місяць is a starting point like any other.
    expect(screen).toMatch(/onSelect=\{\(picked: string\) => ask\(\(\) => setMonth\(picked\)\)\}/);
  });

  it('refuses what is not a calendar місяць, shape or not', () => {
    // A shape check alone would take «2026-13»; this is `isMonth`'s answer, the app's own.
    expect(monthFromRoute('2026-13')).toBeUndefined();
    expect(monthFromRoute('2026-00')).toBeUndefined();
    expect(monthFromRoute('2026-8')).toBeUndefined();
    expect(monthFromRoute('серпень')).toBeUndefined();
    expect(monthFromRoute('2026-08-30')).toBeUndefined();
  });
});

describe('«Без категорії» a route may ask for', () => {
  const screen = readFileSync(new URL('../app/transactions.tsx', import.meta.url), 'utf8');

  it('Scenario: Opened narrowed, and widened by hand', () => {
    expect(uncategorisedFromRoute('uncategorised')).toBe(true);
    // The other half lives in the screen: seeded state, not a prop, and the same setter the chip
    // and «Показати все» call — so the route's narrowing is a starting point like any other.
    expect(screen).toMatch(
      /const \[uncategorisedOnly, setUncategorisedOnly\] = useState\(\s*uncategorisedFromRoute\(/,
    );
    expect(screen).toMatch(/ask\(\(\) => setUncategorisedOnly\(picked === ONLY_UNCATEGORISED\)\)/);
    expect(screen).toContain('setUncategorisedOnly(false);');
  });

  it('Scenario: Anything else asked for narrows nothing', () => {
    expect(uncategorisedFromRoute('продукти')).toBe(false);
    expect(uncategorisedFromRoute('')).toBe(false);
    expect(uncategorisedFromRoute(undefined)).toBe(false);
  });

  it('The narrowing reaches storage and counts as narrowed', () => {
    expect(screen).toMatch(/uncategorisedOnly \? \{ uncategorised: true \} : \{\}/);
    expect(screen).toMatch(/const narrowed =[^;]*uncategorisedOnly/);
  });

  it('Scenario: Nothing left uncategorised says so', () => {
    // An empty list under the narrowing is a narrowing that matched nothing, not an empty history.
    expect(emptyMessage({ shown: 0, narrowed: true })).toContain('Нічого не знайдено');
  });
});

describe('searchLineTitle', () => {
  const names = new Map([
    [UNCATEGORISED_CATEGORY_ID, 'Без категорії'],
    ['groceries', 'Продукти'],
  ]);
  const accounts = new Map([
    ['card', account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' })],
  ]);
  const uklon = transactionLine(
    expenseByDefault({
      id: 'e-uklon',
      date: '2026-09-14',
      accountId: 'card',
      amount: money(18000, 'UAH'),
      description: 'Uklon',
    }),
    accounts,
    names,
  );
  const byHand = transactionLine(
    expenseByDefault({ id: 'e-hand', date: '2026-09-14', accountId: 'card', amount: money(500, 'UAH') }),
    accounts,
    names,
  );

  it('Scenario: The опис is what the owner reads first', () => {
    expect(searchLineTitle(uklon, true)).toBe('Uklon');
  });

  it('Scenario: A line without an опис keeps its usual title', () => {
    expect(searchLineTitle(byHand, true)).toBe(feedTitle(byHand));
    expect(searchLineTitle(byHand, true)).toBe('Без категорії');
  });

  it('With the narrowing off every line reads as the стрічка reads', () => {
    expect(searchLineTitle(uklon, false)).toBe(feedTitle(uklon));
  });

  it('The screen titles its lines through it', () => {
    const screen = readFileSync(new URL('../app/transactions.tsx', import.meta.url), 'utf8');
    expect(screen).toContain('searchLineTitle(line, uncategorisedOnly)');
    // The опис line is dropped only when the narrowing made it the title — never with it off, where
    // a line reads as the стрічка reads even if its опис happens to equal its категорія.
    expect(screen).toContain('line.description && !(uncategorisedOnly && title === line.description)');
  });
});

describe('categorising from «Транзакції»', () => {
  const screen = readFileSync(new URL('../app/transactions.tsx', import.meta.url), 'utf8');

  it('Scenario: One tap categorises from «Транзакції»', () => {
    // The feed's own flow: the same decisions, stored under the same id, the mark decides the offer.
    expect(screen).toContain('transactionsRepo.save(recategorise(t, picked), new Date())');
    // Judged once the screen settles since app-speed-pass (design D5).
    expect(screen).toContain('judgeProgressLater()');
    expect(screen).toMatch(/\.filter\(\(c\) => c\.id !== UNCATEGORISED_CATEGORY_ID\)/);
    expect(screen).toMatch(/line\.uncategorised \? \(\s*<View style=\{styles\.rowActions\}>/);
  });

  it('Scenario: A categorised line leaves the uncategorised list', () => {
    // Storing re-reads every page asked for, through the same `search` the narrowing reads — so the
    // line that no longer carries «Без категорії» is simply not returned, and the rest keep order.
    const categorise = screen.slice(screen.indexOf('const categorise = useCallback('));
    expect(categorise.slice(0, categorise.indexOf('],'))).toContain('reload();');
    // `reload` re-reads as many rows as are shown, in one read (app-speed-pass design D6).
    expect(screen).toContain('const [shown, showNext, reload] = usePagedList(');
  });
});

describe('accountFilterOrder', () => {
  const a = (id: string) => account({ id, name: id, kind: 'spending', currency: 'UAH' });
  const all = [a('Cash'), a('IBKR'), a('mono white'), a('РЕЗЕРВ'), a('гаманець')];

  it('The рахунки in use lead the row', () => {
    expect(accountFilterOrder(all, ['гаманець', 'РЕЗЕРВ', 'mono white']).map((x) => x.id)).toEqual([
      'гаманець',
      'РЕЗЕРВ',
      'mono white',
      'Cash',
      'IBKR',
    ]);
  });

  it('A recent id that is not offered is skipped, and nothing is lost or repeated', () => {
    const ordered = accountFilterOrder(all, ['archived-one', 'IBKR', 'IBKR']).map((x) => x.id);
    expect(ordered).toEqual(['IBKR', 'Cash', 'mono white', 'РЕЗЕРВ', 'гаманець']);
  });

  it('No history keeps the usual order', () => {
    expect(accountFilterOrder(all, [])).toEqual(all);
  });
});

describe('the paused search', () => {
  /**
   * The screen's timer, played over a scripted run of keystrokes: each change (re)arms one timer
   * for `searchDelayMs`, and a search runs when a timer fires undisturbed. Returns every search run.
   */
  function play(keystrokes: readonly { readonly at: number; readonly text: string }[]): string[] {
    const searched: string[] = [];
    let pending: { at: number; text: string } | undefined;
    let field = '';
    for (const key of keystrokes) {
      if (pending && pending.at <= key.at) {
        searched.push(pending.text);
        pending = undefined;
      }
      const delay = searchDelayMs(field, key.text);
      field = key.text;
      if (delay === 0) {
        pending = undefined;
        searched.push(key.text);
      } else {
        pending = { at: key.at + delay, text: key.text };
      }
    }
    if (pending) searched.push(pending.text);
    return searched;
  }

  it('Scenario: Fast typing searches once', () => {
    const typed = 'сільпо';
    const keystrokes = [...typed].map((_, i) => ({ at: i * 80, text: typed.slice(0, i + 1) }));
    // Every letter reaches the field as it is typed — the field is the screen's own state — and
    // the list is searched once, for the whole word, after the pause.
    expect(play(keystrokes)).toEqual(['сільпо']);
    expect(searchDelayMs('сільп', 'сільпо')).toBe(SEARCH_PAUSE_MS);
    expect(SEARCH_PAUSE_MS).toBe(250);
  });

  it('the field owns its text, so a keystroke redraws the field alone', () => {
    const screen = readFileSync(new URL('../app/transactions.tsx', import.meta.url), 'utf8');
    const body = screen.slice(screen.indexOf('export default function'), screen.indexOf('function PausedSearchBar('));
    expect(body).toContain('<PausedSearchBar key={searchReset} onSearch={setQuery} />');
    expect(body).not.toMatch(/const \[typed, setTyped\]/);
    const field = screen.slice(screen.indexOf('function PausedSearchBar('));
    expect(field).toContain("const [typed, setTyped] = useState('')");
    expect(field).toContain('searchDelayMs(searched, typed)');
  });

  it('a pause between words searches at each pause', () => {
    expect(
      play([
        { at: 0, text: 'с' },
        { at: 100, text: 'сі' },
        { at: 500, text: 'сіл' },
      ]),
    ).toEqual(['сі', 'сіл']);
  });

  it('Scenario: Clearing the field is immediate', () => {
    expect(searchDelayMs('сільпо', '')).toBe(0);
    expect(
      play([
        { at: 0, text: 'сільпо' },
        { at: 1000, text: '' },
      ]),
    ).toEqual(['сільпо', '']);
  });
});

describe('the pages «Транзакції» shows', () => {
  const SIZE = 3;
  const at = (i: number) => new Date(Date.UTC(2026, 2, 1, 9, 0, i));
  let storage: TestStorage;

  function seed(db: TestDb, count: number): void {
    seedReferences(db, { categories: ['food'], sources: [] });
    accountsRepo(db).save(account({ id: 'card', name: 'mono', kind: 'spending', currency: 'UAH' }));
    for (let i = 0; i < count; i++) {
      transactionsRepo(db).save(
        expenseByDefault({
          id: `e${String(i).padStart(2, '0')}`,
          date: `2026-03-${String(1 + i).padStart(2, '0')}`,
          accountId: 'card',
          amount: money(100 + i, 'UAH'),
          categoryId: 'food',
          ...(i % 2 === 0 ? { description: `СІЛЬПО ${i}` } : {}),
        }),
        at(i),
      );
    }
  }

  /** One repository per handle, as the app has one — its search memo lives with it. */
  function ports(db: TestDb, match?: { text: string }): PagePorts {
    const repo = transactionsRepo(db);
    return {
      read: (limit, offset) =>
        repo.search({
          ...(match ? { match: { text: match.text, categoryIds: [], sourceIds: [] } } : {}),
          limit,
          offset,
        }),
      stamp: () => storageStamp(db),
    };
  }

  const ids = (rows: readonly Transaction[]) => rows.map((t) => t.id);

  beforeEach(() => {
    storage = openTestDb();
    seed(storage.db, 12);
  });

  afterEach(() => storage.close());

  it('Scenario: The third page reads one page', () => {
    const counting = countingDb(storage);
    const two = nextPage(firstPage(ports(counting.db), SIZE), ports(counting.db), SIZE);
    counting.reset();

    const three = nextPage(two, ports(counting.db), SIZE);

    // The stamp, and one page plus the row that says whether more remain.
    expect(counting.rowsRead()).toBe(1 + SIZE + 1);
    expect(ids(three.transactions)).toEqual(ids(firstPage(ports(storage.db), 3 * SIZE).transactions));
    expect(three.more).toBe(true);
  });

  it('Scenario: More of a search reads nothing already read', () => {
    const counting = countingDb(storage);
    const search = ports(counting.db, { text: 'сільпо' });
    const one = firstPage(search, SIZE);
    counting.reset();

    const two = nextPage(one, search, SIZE);

    // The memoized matches, keyed on the criteria, are sliced: the only rows read are two change
    // stamps — the page's own and the memo's — and not one транзакція.
    expect(counting.rowsRead()).toBe(2);
    expect(ids(two.transactions)).toEqual(ids(firstPage(ports(storage.db, { text: 'сільпо' }), 2 * SIZE).transactions));
  });

  it('Scenario: A транзакція stored between pages is neither repeated nor lost', () => {
    const two = nextPage(firstPage(ports(storage.db), SIZE), ports(storage.db), SIZE);
    // A прогін stores a new транзакція, dated inside the pages already shown.
    transactionsRepo(storage.db).save(
      expenseByDefault({ id: 'late', date: '2026-03-11', accountId: 'card', amount: money(5, 'UAH'), categoryId: 'food' }),
      at(99),
    );

    const three = nextPage(two, ports(storage.db), SIZE);

    const shown = ids(three.transactions);
    expect(new Set(shown).size).toBe(shown.length);
    // Read again together with the next page: the newest-first listing's head, the new one in it.
    expect(shown).toEqual(ids(transactionsRepo(storage.db).listLatest(3 * SIZE)));
    expect(shown).toContain('late');
  });

  it('Scenario: Coming back from a транзакція keeps the pages shown — the screen wiring', () => {
    // A focus re-reads the категорії and джерела a search is built from, which rebuilds the read
    // for the same question. The pages start over only when the question itself — as a value —
    // changes, never on a new read's identity (diff review, app-speed-pass).
    const screen = readFileSync(new URL('../app/transactions.tsx', import.meta.url), 'utf8');
    expect(screen).toMatch(/const question = JSON\.stringify\(\{ criteria: criteria \?\? null, accountId, month, uncategorisedOnly \}\);/);
    expect(screen).toContain('usePagedList(question, pagePorts)');
    const hook = readFileSync(new URL('../hooks/use-paged-list.ts', import.meta.url), 'utf8');
    expect(hook).toContain('if (state.question !== question) {');
    expect(hook).not.toMatch(/state\.ports !== ports/);
  });

  it('Scenario: Coming back from a транзакція keeps the pages shown', () => {
    const three = nextPage(nextPage(firstPage(ports(storage.db), SIZE), ports(storage.db), SIZE), ports(storage.db), SIZE);
    const counting = countingDb(storage);

    const back = rereadPages(three, ports(counting.db), SIZE);

    expect(ids(back.transactions)).toEqual(ids(three.transactions));
    expect(back.transactions).toHaveLength(3 * SIZE);
    // One read: the stamp, the rows shown and the one that says more remain.
    expect(counting.rowsRead()).toBe(1 + 3 * SIZE + 1);
  });

  it('a транзакція committed by another opening during a page read is neither repeated nor lost', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cap1tal-pages-'));
    const app = openFileDb(join(dir, 'cap1tal.db'));
    const background = openFileDb(join(dir, 'cap1tal.db'));
    try {
      seed(app.db, 12);
      const base = ports(app.db);
      let committed = false;
      // The page read runs its SELECT, and the other opening commits before the read returns.
      const racing: PagePorts = {
        stamp: base.stamp,
        read: (limit, offset) => {
          const rows = base.read(limit, offset);
          if (!committed) {
            committed = true;
            transactionsRepo(background.db).save(
              expenseByDefault({ id: 'late', date: '2026-03-12', accountId: 'card', amount: money(5, 'UAH'), categoryId: 'food' }),
              at(99),
            );
          }
          return rows;
        },
      };
      const one = firstPage(racing, SIZE);
      const two = nextPage(one, base, SIZE);

      const shown = ids(two.transactions);
      expect(new Set(shown).size).toBe(shown.length);
      expect(shown).toEqual(ids(transactionsRepo(app.db).listLatest(2 * SIZE)));
      expect(shown).toContain('late');
    } finally {
      app.close();
      background.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
