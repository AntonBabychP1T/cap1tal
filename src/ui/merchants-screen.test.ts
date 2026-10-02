import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { accountsRepo } from '../db/accounts-repo';
import { merchantsRepo, type MerchantsRepo } from '../db/merchants-repo';
import { rulesRepo } from '../db/rules-repo';
import { openTestDb, seedReferences, seedReservedCategories, type TestStorage } from '../db/test-db';
import { transactionsRepo } from '../db/transactions-repo';
import { account } from '../domain/account';
import { NO_MERCHANTS, merchant, merchantIndex, type Merchant } from '../domain/merchants';
import { money } from '../domain/money';
import {
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  expenseByDefault,
  refund,
  type Income,
  type Transaction,
} from '../domain/transaction';
import { bindTestJournal } from './journal';
import {
  EVERYTHING_RECOGNISED,
  NAMELESS_LIMIT,
  NO_MERCHANTS_YET,
  deleteOutcome,
  mergeConfirmation,
  merchantRows,
  merchantTransactionsHref,
  namelessGroups,
  namelessMore,
  namingErrors,
  namingFormFor,
  renameError,
  spellingRows,
  submitNaming,
  transactionMerchantRow,
} from './merchants-screen';

let n = 0;
/** A витрата, newest first in the order the tests list them — as `storedHistory` hands them over. */
const spent = (description?: string, type: 'expense' | 'refund' = 'expense'): Transaction => {
  n += 1;
  const base = { id: `t${n}`, date: '2026-09-01', accountId: 'card', amount: money(100 * n, 'UAH'), categoryId: 'food' };
  return type === 'refund'
    ? refund({ ...base, ...(description ? { description } : {}) })
    : expenseByDefault({ ...base, ...(description ? { description } : {}) });
};

const named = (id: string, name: string, ...spellings: string[]): Merchant =>
  merchant({
    id,
    name,
    spellings: spellings.map((spelling, i) => ({ id: `${id}-${i}`, spelling, addedAt: new Date(i) })),
    createdAt: new Date(0),
  });

describe('«Без продавця»', () => {
  it('Scenario: Branch spellings of one shop are one row', () => {
    const history = [
      ...Array.from({ length: 7 }, () => spent('АТБ-Маркет 1234')),
      ...Array.from({ length: 5 }, () => spent('АТБ-Маркет 5678')),
      ...Array.from({ length: 4 }, () => spent('Uklon *trip')),
    ];
    const { groups } = namelessGroups(history, NO_MERCHANTS);
    expect(groups).toEqual([
      // The latest of those описи: the history comes newest first, so it is the first one met.
      { spelling: 'атб', description: 'АТБ-Маркет 1234', count: 12 },
      { spelling: 'uklon', description: 'Uklon *trip', count: 4 },
    ]);
  });

  it('a tie goes to the group whose latest транзакція is the most recent', () => {
    const history = [spent('Uklon 1'), spent('АТБ 1'), spent('АТБ 2'), spent('Uklon 2')];
    expect(namelessGroups(history, NO_MERCHANTS).groups.map((g) => g.spelling)).toEqual(['uklon', 'атб']);
  });

  it('Scenario: Only twenty rows, and the rest is counted', () => {
    const history = Array.from({ length: 23 }, (_, i) => spent(`Магазин${String.fromCharCode(1072 + i)} 1`));
    const { groups, more } = namelessGroups(history, NO_MERCHANTS);
    expect(groups).toHaveLength(NAMELESS_LIMIT);
    expect(more).toBe(3);
    expect(namelessMore(more)).toBe('І ще 3 описи без продавця.');
    expect(namelessMore(0)).toBeUndefined();
  });

  it('Scenario: Everything recognised', () => {
    const history = [spent('АТБ 12'), spent('ATB MARKET'), spent(undefined)];
    const index = merchantIndex([named('atb', 'АТБ', 'атб', 'atb')]);
    expect(namelessGroups(history, index)).toEqual({ groups: [], more: 0 });
    expect(EVERYTHING_RECOGNISED).toBe('Кожен опис уже має продавця.');
    const screen = readFileSync(new URL('../app/manage/merchants.tsx', import.meta.url), 'utf8');
    expect(screen).toContain('{EVERYTHING_RECOGNISED}');
  });

  it('Scenario: A дохід is not a nameless продавець', () => {
    const salary: Income = {
      type: 'income',
      id: 'i1',
      date: '2026-09-01',
      accountId: 'card',
      amount: money(5_000_000, 'UAH'),
      sourceId: UNSOURCED_SOURCE_ID,
      description: 'Зарахування зарплати',
    };
    expect(namelessGroups([salary], NO_MERCHANTS).groups).toEqual([]);
    // A повернення is who the owner paid, and is listed.
    expect(namelessGroups([spent('ROZETKA повернення', 'refund')], NO_MERCHANTS).groups).toHaveLength(1);
  });
});

describe('the продавці list', () => {
  it('Scenario: The list counts what each продавець recognises', () => {
    const atb = named('atb', 'АТБ', 'атб');
    const uklon = named('uklon', 'Uklon', 'uklon');
    const history = [
      ...Array.from({ length: 12 }, () => spent('АТБ 12')),
      ...Array.from({ length: 4 }, () => spent('Uklon *trip')),
      spent('Сільпо'),
    ];
    const rows = merchantRows([uklon, atb], history, merchantIndex([atb, uklon]));
    expect(rows.map((r) => [r.name, r.count])).toEqual([
      ['АТБ', 12],
      ['Uklon', 4],
    ]);
    expect(rows[0]?.countLabel).toBe('12 транзакцій');
  });

  it('orders by назва with letter case folded', () => {
    const rows = merchantRows([named('b', 'bolt', 'bolt'), named('a', 'Apple', 'apple')], [], NO_MERCHANTS);
    expect(rows.map((r) => r.name)).toEqual(['Apple', 'bolt']);
  });

  it('Scenario: No продавець yet', () => {
    expect(merchantRows([], [spent('АТБ')], NO_MERCHANTS)).toEqual([]);
    expect(NO_MERCHANTS_YET).toContain('«Без продавця»');
    const screen = readFileSync(new URL('../app/manage/merchants.tsx', import.meta.url), 'utf8');
    expect(screen).toContain('{NO_MERCHANTS_YET}');
  });
});

describe('the naming form', () => {
  const atb = named('atb', 'АТБ', 'атб');

  it('opens on the proposal the merchants capability makes, or on one it is handed', () => {
    expect(namingFormFor('Оплата послуг АТБ-Маркет 1234 Київ')).toEqual({
      description: 'Оплата послуг АТБ-Маркет 1234 Київ',
      name: 'АТБ',
      spelling: 'атб',
    });
    expect(namingFormFor('ЗЕРНО 12', { name: 'Кавʼярня Зерно', spelling: 'зерно' }).name).toBe('Кавʼярня Зерно');
  });

  it('Scenario: A назва that is taken offers the продавець that holds it', () => {
    const errors = namingErrors({ description: 'ATB MARKET 23', name: 'атб', spelling: 'atb market' }, [atb], 'new');
    expect(errors.name).toBe('«АТБ» уже є — можна додати написання до нього');
    expect(errors.takenBy).toEqual({ id: 'atb', name: 'АТБ' });
  });

  it('Scenario: A написання outside the опис is refused in words', () => {
    const errors = namingErrors({ description: 'ATB MARKET 23', name: 'АТБ Маркет', spelling: 'атб' }, [], 'new');
    expect(errors.spelling).toBe('Написання має бути частиною опису');
  });

  it('refuses a blank назва, a blank написання and a написання another продавець holds', () => {
    expect(namingErrors({ description: 'X', name: ' ', spelling: 'x' }, [], 'new').name).toBe(
      'Назва не може бути порожньою',
    );
    expect(namingErrors({ description: 'X', name: 'X', spelling: '  ' }, [], 'new').spelling).toBe(
      'Написання не може бути порожнім',
    );
    expect(namingErrors({ description: 'АТБ 12', name: 'Інший', spelling: 'атб' }, [atb], 'new').spelling).toBe(
      'Це написання вже має «АТБ»',
    );
    // Adding to an existing продавець checks the написання alone: the назва that stands is its own.
    expect(namingErrors({ description: 'ATB 1', name: '', spelling: 'atb' }, [atb], 'existing')).toEqual({});
  });
});

describe('the naming form against storage', () => {
  let storage: TestStorage;
  let repo: MerchantsRepo;
  let id = 0;
  const ports = () => ({ name: repo.name, newId: () => `id-${++id}`, now: () => new Date('2026-09-02T10:00:00Z') });

  beforeEach(() => {
    bindTestJournal();
    storage = openTestDb();
    seedReservedCategories(storage.db);
    // A категорія no базова категорія lands in, so only the owner's правила move anything.
    seedReferences(storage.db, { categories: ['food'] });
    accountsRepo(storage.db).save(account({ id: 'card', name: 'mono', kind: 'spending', currency: 'UAH' }));
    repo = merchantsRepo(storage.db);
  });

  afterEach(() => storage.close());

  const store = (description: string, categoryId = UNCATEGORISED_CATEGORY_ID) => {
    n += 1;
    transactionsRepo(storage.db).save(
      expenseByDefault({ id: `s${n}`, date: '2026-09-01', accountId: 'card', amount: money(100, 'UAH'), categoryId, description }),
      new Date(n),
    );
  };

  it('Scenario: Naming from «Без продавця»', async () => {
    for (let i = 0; i < 7; i++) store('АТБ-Маркет 1234', 'food');
    for (let i = 0; i < 5; i++) store('АТБ-Маркет 5678', 'food');
    const before = namelessGroups(transactionsRepo(storage.db).listAll(), repo.index());
    const row = before.groups.find((g) => g.spelling === 'атб')!;

    const outcome = await submitNaming(namingFormFor(row.description), { kind: 'new' }, repo.list(), ports());

    expect(outcome).toEqual({ kind: 'stored' });
    expect(repo.list().map((m) => m.name)).toEqual(['АТБ']);
    const after = namelessGroups(transactionsRepo(storage.db).listAll(), repo.index());
    expect(after.groups.find((g) => g.spelling === 'атб')).toBeUndefined();
    const index = repo.index();
    expect(transactionsRepo(storage.db).listAll().filter((t) => index.recognise(t.description)?.name === 'АТБ')).toHaveLength(12);
  });

  it('Scenario: Adding a spelling to a продавець that exists', async () => {
    await submitNaming(namingFormFor('АТБ 12'), { kind: 'new' }, repo.list(), ports());
    const atbId = repo.list()[0]!.id;

    const outcome = await submitNaming(
      { description: 'ATB MARKET 23', name: '', spelling: 'atb market' },
      { kind: 'existing', merchantId: atbId },
      repo.list(),
      ports(),
    );

    expect(outcome.kind).toBe('stored');
    expect(repo.list()).toHaveLength(1);
    expect(repo.get(atbId)?.spellings.map((s) => s.spelling)).toEqual(['атб', 'atb market']);
  });

  it('Scenario: The розбір is reported', async () => {
    store('АТБ 12', 'food');
    await submitNaming(namingFormFor('АТБ 12'), { kind: 'new' }, repo.list(), ports());
    const atbId = repo.list()[0]!.id;
    rulesRepo(storage.db).save({ id: 'r-atb', merchantId: atbId, target: { kind: 'category', categoryId: 'food' }, createdAt: new Date(0) });
    store('ATB MARKET 1');
    store('ATB MARKET 2');

    const outcome = await submitNaming(
      { description: 'ATB MARKET 1', name: '', spelling: 'atb market' },
      { kind: 'existing', merchantId: atbId },
      repo.list(),
      ports(),
    );

    expect(outcome).toEqual({ kind: 'stored', said: '2 витрати перекатегоризовано.' });
  });

  it('a refusal is said beside its field and stores nothing', async () => {
    const outcome = await submitNaming({ description: 'ATB MARKET 23', name: 'АТБ', spelling: 'атб' }, { kind: 'new' }, [], ports());
    expect(outcome).toEqual({ kind: 'refused', errors: { spelling: 'Написання має бути частиною опису' } });
    expect(repo.list()).toEqual([]);
  });

  it('Scenario: Renaming', () => {
    store('ATB MARKET 1');
    repo.name({ description: 'ATB MARKET 1', spelling: 'atb market', spellingId: 's1', into: { kind: 'new', id: 'm1', name: 'ATB Market' }, now: new Date(0) });
    const m = repo.get('m1')!;
    expect(renameError('АТБ', m, repo.list())).toBeUndefined();
    repo.rename('m1', 'АТБ');
    expect(merchantRows(repo.list(), transactionsRepo(storage.db).listAll(), repo.index())).toEqual([
      { id: 'm1', name: 'АТБ', count: 1, countLabel: '1 транзакція' },
    ]);
    expect(repo.get('m1')?.spellings.map((s) => s.spelling)).toEqual(['atb market']);
  });
});

describe('a продавець\'s screen', () => {
  it('Scenario: The last написання offers no removal', () => {
    expect(spellingRows(named('zerno', 'Зерно', 'зерно'))).toEqual([{ id: 'zerno-0', spelling: 'зерно', removable: false }]);
    expect(spellingRows(named('atb', 'АТБ', 'атб', 'atb')).every((s) => s.removable)).toBe(true);
  });

  it('Scenario: Merging names both before it happens', () => {
    const said = mergeConfirmation(named('m', 'ATB Market', 'atb market'), named('atb', 'АТБ', 'атб'), 1);
    expect(said).toContain('«ATB Market»');
    expect(said).toContain('«АТБ»');
    expect(said).toContain('«atb market»');
    expect(said).toContain('1 правило');
    const screen = readFileSync(new URL('../app/merchant/[id].tsx', import.meta.url), 'utf8');
    // Confirmed first, and the owner lands on the продавець that remains.
    expect(screen).toContain("Alert.alert('Обʼєднати продавців?', mergeConfirmation(");
    expect(screen).toContain("router.replace({ pathname: '/merchant/[id]', params: { id: into.id } })");
  });

  it('Scenario: Deleting a продавець that правила name leads to them', () => {
    const atb = named('atb', 'АТБ', 'атб');
    expect(deleteOutcome(atb, 2)).toEqual({
      kind: 'refused',
      message: '«АТБ» називають 2 правила. Спершу змініть або видаліть їх у «Правилах».',
      leadsTo: '/manage/rules',
    });
    expect(deleteOutcome(atb, 0).kind).toBe('confirm');
  });

  it('Scenario: The продавець\'s транзакції', () => {
    expect(merchantTransactionsHref('atb')).toEqual({ pathname: '/transactions', params: { merchant: 'atb' } });
    const screen = readFileSync(new URL('../app/merchant/[id].tsx', import.meta.url), 'utf8');
    expect(screen).toContain('router.push(merchantTransactionsHref(merchant.id))');
  });
});

describe('the «Продавець» row of transaction editing', () => {
  const index = merchantIndex([named('atb', 'АТБ', 'atb')]);

  it('Scenario: A recognised транзакція names its продавець', () => {
    expect(transactionMerchantRow('ATB MARKET 23', index)).toEqual({ kind: 'recognised', merchantId: 'atb', name: 'АТБ' });
  });

  it('Scenario: An unrecognised транзакція offers naming', () => {
    expect(transactionMerchantRow('ЗЕРНО 12', index)).toEqual({
      kind: 'nameless',
      form: { description: 'ЗЕРНО 12', name: 'Зерно', spelling: 'зерно' },
    });
  });

  it('Scenario: No опис, no row', () => {
    expect(transactionMerchantRow(undefined, index)).toBeUndefined();
  });

  it('the editor reads the row from the опис as stored', () => {
    const screen = readFileSync(new URL('../app/transaction/[id].tsx', import.meta.url), 'utf8');
    expect(screen).toContain('transactionMerchantRow(original?.description, merchantIndex(stored.merchants))');
  });
});
