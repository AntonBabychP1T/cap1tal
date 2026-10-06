import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import type { Rule } from '../domain/rules';
import { UNCATEGORISED_CATEGORY_ID, expenseByDefault, type Expense } from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { categorisationContext } from './categorisation';
import { merchantsRepo, type MerchantsRepo } from './merchants-repo';
import { rulesRepo } from './rules-repo';
import { openFileDb, openTestDb, seedReferences, seedReservedCategories, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

/**
 * Категорії no базова категорія lands in by default, so the шаблон answers nothing here and every
 * move a test sees is the правила's — «Продукти» switched off, as the scenarios put it.
 */
const VOCABULARY = { categories: ['food', 'cafe', 'coffee-own'] } as const;
const at = new Date('2026-03-01T10:00:00.000Z');
const later = new Date('2026-03-02T10:00:00.000Z');

function refusalOf(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('merchantsRepo', () => {
  let storage: TestStorage;
  let repo: MerchantsRepo;
  let n = 0;
  const id = (prefix: string) => `${prefix}-${++n}`;

  const expense = (expenseId: string, description: string | undefined, over: Partial<Expense> = {}): Expense =>
    expenseByDefault({
      id: expenseId,
      date: '2026-03-05',
      accountId: 'card',
      amount: money(12550, 'UAH'),
      ...(description ? { description } : {}),
      ...over,
    });

  /** A new продавець named from `description`, with one написання. */
  const name = (merchantId: string, merchantName: string, spelling: string, description = spelling) =>
    repo.name({
      description,
      spelling,
      spellingId: id('s'),
      into: { kind: 'new', id: merchantId, name: merchantName },
      now: at,
    });

  beforeEach(() => {
    storage = openTestDb();
    seedReservedCategories(storage.db);
    seedReferences(storage.db, VOCABULARY);
    accountsRepo(storage.db).save(account({ id: 'card', name: 'mono', kind: 'spending', currency: 'UAH' }));
    repo = merchantsRepo(storage.db);
  });

  afterEach(() => storage.close());

  describe('naming', () => {
    it('Scenario: A new продавець from an опис', () => {
      name('zerno', 'Зерно', 'зерно', 'ЗЕРНО 12');
      expect(repo.list()).toMatchObject([{ id: 'zerno', name: 'Зерно', spellings: [{ spelling: 'зерно' }] }]);
      expect(repo.index().recognise('ЗЕРНО 12')?.name).toBe('Зерно');
    });

    it('Scenario: A spelling added to an existing продавець', () => {
      name('atb', 'АТБ', 'атб');
      repo.name({
        description: 'ATB MARKET 23',
        spelling: 'atb market',
        spellingId: id('s'),
        into: { kind: 'existing', merchantId: 'atb' },
        now: later,
      });
      expect(repo.get('atb')?.spellings.map((s) => s.spelling)).toEqual(['атб', 'atb market']);
      expect(repo.list()).toHaveLength(1);
      expect(repo.index().recognise('ATB MARKET 23')?.merchantId).toBe('atb');
    });

    it('Scenario: A blank назва is refused', () => {
      expect(refusalOf(() => name('x', '   ', 'атб'))).toBeDefined();
      expect(repo.list()).toEqual([]);
    });

    it('Scenario: A назва differing only in case is the same назва', () => {
      name('atb', 'АТБ', 'атб');
      expect(refusalOf(() => name('x', 'атб ', 'atb'))).toContain('АТБ');
      expect(repo.list().map((m) => m.name)).toEqual(['АТБ']);
    });

    it('Scenario: A написання belongs to one продавець only', () => {
      name('atb', 'АТБ', 'атб');
      expect(refusalOf(() => name('home', 'Магазин біля дому', 'АТБ', 'АТБ 12'))).toContain('«АТБ»');
      expect(repo.list().map((m) => m.name)).toEqual(['АТБ']);
    });

    it('Scenario: A продавець with no написання is refused', () => {
      expect(refusalOf(() => name('silpo', 'Сільпо', '  ', 'СІЛЬПО'))).toBeDefined();
      expect(repo.list()).toEqual([]);
    });

    it('Scenario: A написання that is not in the опис is refused', () => {
      expect(refusalOf(() => name('atb', 'АТБ', 'атб', 'ATB MARKET 23'))).toBe('Написання має бути частиною опису');
      expect(repo.list()).toEqual([]);
    });

    it('Scenario: A написання inside a word of the опис is refused', () => {
      expect(refusalOf(() => name('magazin', 'Magazin', 'magazin', 'ZOOMAGAZIN'))).toBe('Написання має бути частиною опису');
      expect(repo.list()).toEqual([]);
    });

    it('Scenario: A написання that starts with punctuation is accepted', () => {
      name('megogo', 'Megogo', '*megogo', 'WFP*MEGOGO.NET');
      expect(repo.get('megogo')?.spellings.map((s) => s.spelling)).toEqual(['*megogo']);
      expect(repo.index().recognise('WFP*MEGOGO.NET')?.merchantId).toBe('megogo');
    });

    it('an опис already recognised is not named again', () => {
      name('atb', 'АТБ', 'атб');
      expect(refusalOf(() => name('x', 'Інший', 'атб 12', 'АТБ 12'))).toContain('АТБ');
      expect(repo.list()).toHaveLength(1);
    });
  });

  describe('changing a продавець', () => {
    it('Scenario: A rename keeps every написання', () => {
      name('atb', 'ATB Market', 'atb market');
      repo.addSpelling({ merchantId: 'atb', spelling: 'атб', spellingId: id('s'), now: later });
      repo.rename('atb', 'АТБ');
      expect(repo.get('atb')).toMatchObject({ name: 'АТБ', spellings: [{ spelling: 'atb market' }, { spelling: 'атб' }] });
    });

    it('a rename to a назва another продавець has is refused', () => {
      name('atb', 'АТБ', 'атб');
      name('silpo', 'Сільпо', 'сільпо');
      expect(refusalOf(() => repo.rename('silpo', 'атб'))).toContain('АТБ');
      // Its own назва in another case is no conflict.
      repo.rename('atb', 'атб');
      expect(repo.get('atb')?.name).toBe('атб');
    });

    it('Scenario: A removed написання stops recognising', () => {
      name('atb', 'АТБ', 'атб');
      repo.addSpelling({ merchantId: 'atb', spelling: 'atb', spellingId: 's-atb', now: later });
      expect(repo.index().recognise('ATB MARKET')?.name).toBe('АТБ');
      repo.removeSpelling('s-atb', later);
      expect(repo.index().recognise('ATB MARKET')).toBeUndefined();
    });

    it('Scenario: The last написання cannot be removed', () => {
      name('zerno', 'Зерно', 'зерно');
      const only = repo.get('zerno')!.spellings[0]!;
      expect(refusalOf(() => repo.removeSpelling(only.id, later))).toBeDefined();
      expect(repo.get('zerno')?.spellings.map((s) => s.spelling)).toEqual(['зерно']);
    });

    it('Scenario: A merge keeps every spelling and every правило', () => {
      name('atb-market', 'ATB Market', 'atb market');
      name('atb', 'АТБ', 'атб');
      rulesRepo(storage.db).save({
        id: 'r1',
        merchantId: 'atb-market',
        target: { kind: 'category', categoryId: 'food' },
        createdAt: at,
      });
      repo.merge('atb-market', 'atb', later);
      expect(repo.get('atb-market')).toBeUndefined();
      expect(repo.get('atb')?.spellings.map((s) => s.spelling).sort()).toEqual(['atb market', 'атб']);
      expect(rulesRepo(storage.db).get('r1')?.merchantId).toBe('atb');
      expect(repo.get('atb')?.name).toBe('АТБ');
    });

    it('Scenario: A продавець cannot merge into itself', () => {
      name('atb', 'АТБ', 'атб');
      expect(refusalOf(() => repo.merge('atb', 'atb', later))).toBeDefined();
      expect(repo.get('atb')?.spellings).toHaveLength(1);
    });
  });

  describe('deleting a продавець', () => {
    it('Scenario: A продавець named by a правило is kept', () => {
      name('atb', 'АТБ', 'атб');
      for (const ruleId of ['r1', 'r2']) {
        rulesRepo(storage.db).save({
          id: ruleId,
          merchantId: 'atb',
          target: { kind: 'category', categoryId: ruleId === 'r1' ? 'food' : 'cafe' },
          createdAt: at,
        });
      }
      expect(repo.rulesNaming('atb')).toBe(2);
      expect(refusalOf(() => repo.remove('atb', later))).toContain('2');
      expect(repo.get('atb')?.spellings.map((s) => s.spelling)).toEqual(['атб']);
    });

    it('Scenario: A продавець a правило names stays', () => {
      // Storage itself refuses it too: `rules.merchant_id` restricts.
      name('atb', 'АТБ', 'атб');
      rulesRepo(storage.db).save({ id: 'r1', merchantId: 'atb', target: { kind: 'category', categoryId: 'food' }, createdAt: at });
      expect(() => storage.db.$client.prepare(`DELETE FROM merchants WHERE id = 'atb'`).run()).toThrow();
      expect(repo.get('atb')).toBeDefined();
      expect(rulesRepo(storage.db).get('r1')?.merchantId).toBe('atb');
    });

    it('Scenario: A removed продавець takes its написання', () => {
      name('zerno', 'Зерно', 'зерно');
      repo.remove('zerno', later);
      expect(repo.list()).toEqual([]);
      expect(repo.index().recognise('ЗЕРНО 12')).toBeUndefined();
      expect(storage.db.$client.prepare('SELECT COUNT(*) AS n FROM merchant_spellings').get()).toEqual({ n: 0 });
    });

    it('Scenario: A deleted продавець leaves its history as it was', () => {
      const txs = transactionsRepo(storage.db);
      for (const n of [1, 2, 3]) txs.save(expense(`e${n}`, 'ЗЕРНО 12', { categoryId: 'coffee-own' }), at);
      name('zerno', 'Зерно', 'зерно', 'ЗЕРНО 12');
      const before = txs.listAll();
      repo.remove('zerno', later);
      expect(repo.index().recognise('ЗЕРНО 12')).toBeUndefined();
      expect(txs.listAll()).toEqual(before);
    });
  });

  describe('the розбір a change runs', () => {
    const atbToFood: Rule = { id: 'r-atb', merchantId: 'atb', target: { kind: 'category', categoryId: 'food' }, createdAt: at };

    it('Scenario: A rule naming a продавець is stored', () => {
      name('atb', 'АТБ', 'атб');
      rulesRepo(storage.db).save(atbToFood);
      const stored = rulesRepo(storage.db).get('r-atb');
      expect(stored).toEqual(atbToFood);
      expect(stored?.merchant).toBeUndefined();
    });

    it('Scenario: A rule naming an unknown продавець is rejected', () => {
      expect(refusalOf(() => rulesRepo(storage.db).save({ ...atbToFood, merchantId: 'nobody' }))).toBe('Такого продавця немає');
      expect(rulesRepo(storage.db).list()).toEqual([]);
    });

    it('a rule naming both a pattern and a продавець is refused by the repository', () => {
      name('atb', 'АТБ', 'атб');
      expect(refusalOf(() => rulesRepo(storage.db).save({ ...atbToFood, merchant: 'атб' }))).toBeDefined();
      expect(rulesRepo(storage.db).list()).toEqual([]);
    });

    it('Scenario: A rule switched from a pattern to a продавець', () => {
      name('atb', 'АТБ', 'атб');
      rulesRepo(storage.db).save({ id: 'r1', merchant: 'atb market', target: { kind: 'category', categoryId: 'food' }, createdAt: at });
      rulesRepo(storage.db).save({ id: 'r1', merchantId: 'atb', target: { kind: 'category', categoryId: 'food' }, createdAt: at });
      expect(rulesRepo(storage.db).get('r1')).toEqual({
        id: 'r1',
        merchantId: 'atb',
        target: { kind: 'category', categoryId: 'food' },
        createdAt: at,
      });
    });

    it('Scenario: A spelling added to a продавець that a правило names fills the gap', () => {
      const txs = transactionsRepo(storage.db);
      txs.save(expense('e1', 'ATB MARKET'), at);
      name('atb', 'АТБ', 'атб');
      rulesRepo(storage.db).save(atbToFood);
      expect(txs.get('e1')).toMatchObject({ categoryId: UNCATEGORISED_CATEGORY_ID });
      const counts = repo.addSpelling({ merchantId: 'atb', spelling: 'atb', spellingId: id('s'), now: later });
      expect(counts).toMatchObject({ moved: 1, transferred: 0 });
      expect(txs.get('e1')).toMatchObject({ categoryId: 'food' });
    });

    it('Scenario: A change that moves nothing says nothing', () => {
      transactionsRepo(storage.db).save(expense('e1', 'ЗЕРНО 12'), at);
      const counts = name('zerno', 'Зерно', 'зерно', 'ЗЕРНО 12');
      expect(counts).toMatchObject({ moved: 0, transferred: 0 });
    });

    it('Scenario: A правило naming a продавець sweeps every spelling', () => {
      const txs = transactionsRepo(storage.db);
      txs.save(expense('e1', 'АТБ 12'), at);
      txs.save(expense('e2', 'ATB MARKET'), at);
      name('atb', 'АТБ', 'атб', 'АТБ 12');
      repo.addSpelling({ merchantId: 'atb', spelling: 'atb', spellingId: id('s'), now: at });
      const counts = rulesRepo(storage.db).save(atbToFood);
      expect(counts).toMatchObject({ moved: 2 });
      expect([txs.get('e1'), txs.get('e2')].map((t) => t && 'categoryId' in t && t.categoryId)).toEqual(['food', 'food']);
    });

    it('Scenario: A new написання reaches the history at once', () => {
      const txs = transactionsRepo(storage.db);
      for (const [n, description] of ['ATB MARKET 1', 'ATB MARKET 2', 'ATB 7'].entries()) {
        txs.save(expense(`e${n}`, description, { categoryId: 'cafe' }), at);
      }
      name('atb', 'АТБ', 'атб');
      const before = txs.listAll();
      repo.addSpelling({ merchantId: 'atb', spelling: 'atb', spellingId: id('s'), now: later });
      const index = repo.index();
      expect(txs.listAll().map((t) => index.recognise(t.description)?.name)).toEqual(['АТБ', 'АТБ', 'АТБ']);
      // Recognition rewrote nothing: every сума, дата, рахунок, категорія and опис is as it was.
      expect(txs.listAll()).toEqual(before);
    });

    it('Scenario: Correcting the опис changes the продавець', () => {
      const txs = transactionsRepo(storage.db);
      txs.save(expense('e1', 'АТБ 12'), at);
      name('atb', 'АТБ', 'атб', 'АТБ 12');
      expect(repo.index().recognise(txs.get('e1')?.description)?.name).toBe('АТБ');
      // The owner rewrites the опис: the транзакція now has whatever the new опис is recognised as.
      txs.save(expense('e1', 'кава з Олею'), later);
      expect(repo.index().recognise(txs.get('e1')?.description)).toBeUndefined();
      // Nothing about the продавець was ever on the транзакція to clear.
      expect(txs.get('e1')).toEqual(expense('e1', 'кава з Олею'));
    });

    it('Scenario: Recognition alone categorises nothing', () => {
      const txs = transactionsRepo(storage.db);
      txs.save(expense('e1', 'ЗЕРНО 12'), at);
      name('zerno', 'Зерно', 'зерно', 'ЗЕРНО 12');
      expect(repo.index().recognise('ЗЕРНО 12')?.name).toBe('Зерно');
      expect(txs.get('e1')).toMatchObject({ categoryId: UNCATEGORISED_CATEGORY_ID });
    });

    it('Scenario: A продавець changes no number', () => {
      const txs = transactionsRepo(storage.db);
      txs.save(expense('e1', 'АТБ 12', { amount: money(120000, 'UAH') }), at);
      const before = txs.listAll();
      name('atb', 'АТБ', 'атб', 'АТБ 12');
      expect(txs.listAll()).toEqual(before);
      expect(before.reduce((sum, t) => sum + (t.type === 'expense' ? t.amount.amount : 0), 0)).toBe(120000);
    });

    it('a правило naming a продавець decides in the розбір context read from storage', () => {
      name('atb', 'АТБ', 'атб');
      rulesRepo(storage.db).save(atbToFood);
      const context = categorisationContext(storage.db);
      expect(context.merchants.recognise('Оплата послуг АТБ-Маркет')?.merchantId).toBe('atb');
      expect(context.rules.map((r) => r.merchantId)).toEqual(['atb']);
    });
  });
});

describe('merchantsRepo across a restart', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cap1tal-merchants-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('Scenario: A продавець comes back whole', () => {
    const path = join(dir, 'db.sqlite');
    const first = openFileDb(path);
    seedReservedCategories(first.db);
    seedReferences(first.db, VOCABULARY);
    accountsRepo(first.db).save(account({ id: 'card', name: 'mono', kind: 'spending', currency: 'UAH' }));
    const repo = merchantsRepo(first.db);
    repo.name({ description: 'атб', spelling: 'атб', spellingId: 's1', into: { kind: 'new', id: 'atb', name: 'АТБ' }, now: at });
    repo.addSpelling({ merchantId: 'atb', spelling: 'ATB', spellingId: 's2', now: later });
    rulesRepo(first.db).save({ id: 'r1', merchantId: 'atb', target: { kind: 'category', categoryId: 'food' }, createdAt: at });
    const imported = expenseByDefault({
      id: 'e1',
      date: '2026-03-05',
      accountId: 'card',
      amount: money(12550, 'UAH'),
      description: 'СІЛЬПО',
      mcc: 5411,
    });
    transactionsRepo(first.db).save(imported, at);
    const before = repo.list();
    first.close();

    const reopened = openFileDb(path);
    try {
      expect(merchantsRepo(reopened.db).list()).toEqual(before);
      expect(before[0]?.spellings).toEqual([
        { id: 's1', spelling: 'атб', addedAt: at },
        { id: 's2', spelling: 'atb', addedAt: later },
      ]);
      expect(rulesRepo(reopened.db).get('r1')?.merchantId).toBe('atb');
      expect(transactionsRepo(reopened.db).get('e1')).toEqual(imported);
    } finally {
      reopened.close();
    }
  });
});
