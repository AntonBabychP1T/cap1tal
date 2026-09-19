import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { matchCategory, type Rule, type RuleTarget } from '../domain/rules';
import {
  CORRECTION_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  expenseByDefault,
  refund,
  type Income,
} from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { rulesRepo, type RulesRepo } from './rules-repo';
import { accounts, categories, sources } from './schema';
import {
  openFileDb,
  openTestDb,
  seedReferences,
  seedReservedCategories,
  seedReservedSources,
  type TestStorage,
} from './test-db';
import { transactionsRepo, type TransactionsRepo } from './transactions-repo';

/** The categories these rules target. Their names are their ids — see seedReferences. */
const VOCABULARY = { categories: ['groceries', 'eating-out'] } as const;

/** The moment a stored транзакція was first written; the розбір must not disturb it. */
const stored = new Date('2026-03-02T08:00:00.000Z');

/** A fixed instant: a rule's creation moment is data these tests control, never the wall clock. */
const created = new Date('2026-03-01T10:00:00.000Z');

const silpo: Rule = {
  id: 'r-silpo',
  merchant: 'сільпо',
  target: { kind: 'category', categoryId: 'groceries' },
  createdAt: created,
};

describe('rulesRepo', () => {
  let storage: TestStorage;
  let repo: RulesRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    repo = rulesRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A merchant-only rule is stored', () => {
    repo.save(silpo);

    const stored = repo.get('r-silpo');
    expect(stored?.merchant).toBe('сільпо');
    expect(stored?.target).toEqual({ kind: 'category', categoryId: 'groceries' });
    expect(stored?.mcc).toBeUndefined();
    expect(repo.list()).toEqual([silpo]);
  });

  it('Scenario: A rule with no criterion is rejected', () => {
    const criterionless: Rule = {
      id: 'r-empty',
      target: { kind: 'category', categoryId: 'groceries' },
      createdAt: created,
    };

    expect(() => repo.save(criterionless)).toThrow('Правило потребує продавця або MCC');
    // A pattern of nothing but spaces is no pattern: the same rejection, not a rule that matches
    // every description containing a space.
    expect(() => repo.save({ ...criterionless, merchant: '   ' })).toThrow(
      'Правило потребує продавця або MCC',
    );

    expect(repo.list()).toEqual([]);
  });

  it('Scenario: A rule targeting an unknown category is rejected', () => {
    // The foreign key is what refuses it, not a check in the repository — asserted on the message
    // so the test still fails if `PRAGMA foreign_keys` is ever lost and the row goes in silently.
    expect(() =>
      repo.save({ ...silpo, target: { kind: 'category', categoryId: 'no-such-category' } }),
    ).toThrow(/FOREIGN KEY/i);

    expect(repo.list()).toEqual([]);
  });

  it('Scenario: An edited rule carries its new target', () => {
    repo.save(silpo);

    repo.save({ ...silpo, target: { kind: 'category', categoryId: 'eating-out' } });

    expect(repo.get('r-silpo')?.target).toEqual({ kind: 'category', categoryId: 'eating-out' });
    expect(repo.get('r-silpo')?.merchant).toBe('сільпо');
    // Editing replaces the rule; it does not add a second one under a new id.
    expect(repo.list()).toHaveLength(1);
  });

  it('A merchant pattern is stored trimmed', () => {
    repo.save({ ...silpo, merchant: '  сільпо  ' });

    expect(repo.get('r-silpo')?.merchant).toBe('сільпо');
  });

  it('A merchant pattern that is blank after trimming counts as absent', () => {
    repo.save({
      id: 'r-mcc',
      merchant: '   ',
      mcc: 5411,
      target: { kind: 'category', categoryId: 'groceries' },
      createdAt: created,
    });

    const stored = repo.get('r-mcc');
    expect(stored?.merchant).toBeUndefined();
    expect(stored?.mcc).toBe(5411);
  });

  it('Loading an unknown rule id returns nothing', () => {
    expect(repo.get('never-stored')).toBeUndefined();
  });

  it('A rule round-trips merchant, MCC, target and creation order through list()', () => {
    const mccOnly: Rule = {
      id: 'r-mcc',
      mcc: 5411,
      target: { kind: 'category', categoryId: 'groceries' },
      createdAt: created,
    };
    const later = new Date('2026-03-05T08:30:00.000Z');
    const both: Rule = {
      id: 'r-both',
      merchant: 'уклон',
      mcc: 4121,
      target: { kind: 'category', categoryId: 'eating-out' },
      createdAt: later,
    };
    // Created in the same millisecond as `both`: the id is what keeps the order total.
    const twinA: Rule = {
      id: 'r-a',
      merchant: 'атб',
      target: { kind: 'category', categoryId: 'eating-out' },
      createdAt: later,
    };
    const twinB: Rule = {
      id: 'r-b',
      merchant: 'атб',
      target: { kind: 'category', categoryId: 'groceries' },
      createdAt: later,
    };

    // Saved out of order, so the listing proves the ordering and not the insertion sequence.
    repo.save(both);
    repo.save(twinB);
    repo.save(mccOnly);
    repo.save(twinA);

    expect(repo.list()).toEqual([mccOnly, twinA, twinB, both]);
  });

  it('Scenario: A rule naming both a category and a рахунок is rejected', () => {
    // `Rule.target` is a discriminated union above storage, so an ordinary caller cannot build a
    // rule naming both — this simulates a malformed value reaching the one write path anyway (a
    // restore writes `rules` directly).
    const bothTargets: Rule = {
      ...silpo,
      id: 'r-both-targets',
      target: { kind: 'category', categoryId: 'groceries', toAccountId: 'card' } as unknown as RuleTarget,
    };

    expect(() => repo.save(bothTargets)).toThrow(/категорію.*рахунок/i);

    expect(repo.get('r-both-targets')).toBeUndefined();
  });
});

describe('rulesRepo — a правило-переказ', () => {
  let storage: TestStorage;
  let repo: RulesRepo;

  const reserve: Rule = {
    id: 'r-reserve',
    merchant: 'округлення балансу',
    target: { kind: 'transfer', toAccountId: 'reserve' },
    createdAt: created,
  };

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    accountsRepo(storage.db).save(
      account({ id: 'platinum', name: 'platinum', kind: 'spending', currency: 'UAH' }),
    );
    accountsRepo(storage.db).save(
      account({ id: 'reserve', name: 'РЕЗЕРВ', kind: 'savings', currency: 'UAH' }),
    );
    repo = rulesRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A правило-переказ is stored', () => {
    repo.save(reserve);

    const stored = repo.get('r-reserve');
    expect(stored?.merchant).toBe('округлення балансу');
    expect(stored?.target).toEqual({ kind: 'transfer', toAccountId: 'reserve' });
    expect(repo.list()).toEqual([reserve]);
  });

  it('Scenario: A правило-переказ to an unknown рахунок is rejected', () => {
    expect(() =>
      repo.save({ ...reserve, target: { kind: 'transfer', toAccountId: 'no-such-account' } }),
    ).toThrow(/FOREIGN KEY/i);

    expect(repo.list()).toEqual([]);
  });

  it('a правило-переказ round-trips within one open storage', () => {
    repo.save(reserve);

    expect(repo.get('r-reserve')).toEqual(reserve);
    expect(repo.list()).toEqual([reserve]);
  });
});

describe('rulesRepo and stored transactions', () => {
  let storage: TestStorage;
  let repo: RulesRepo;
  let txs: TransactionsRepo;

  /** Storage recency of the витрата below — a fixed instant, like every other clock in tests. */
  const storedAt = new Date('2026-03-02T09:00:00.000Z');

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    repo = rulesRepo(storage.db);
    txs = transactionsRepo(storage.db);
    accountsRepo(storage.db).save(
      account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' }),
    );
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A deleted rule is gone and history stands', () => {
    repo.save(silpo);
    // The link the scenario rests on: this is the description the rule matched, and
    // `matchCategory` — the function an importer calls when only a category is being decided — is
    // what says the rule is why the витрата carries Groceries. Without this the test would only be
    // storing a category by hand and deleting an unrelated row.
    const description = 'Оплата картою СІЛЬПО';
    expect(matchCategory(repo.list(), { description })).toBe('groceries');
    const imported = expenseByDefault({
      id: 'e-silpo',
      date: '2026-03-02',
      accountId: 'card',
      amount: money(24500, 'UAH'),
      categoryId: matchCategory(repo.list(), { description })!,
    });
    txs.save(imported, storedAt);

    repo.remove('r-silpo');

    expect(repo.get('r-silpo')).toBeUndefined();
    expect(repo.list()).toEqual([]);
    // The same description would now find no rule — and the витрата it already categorised is
    // untouched, because a rule acts at import time and never retroactively.
    expect(matchCategory(repo.list(), { description })).toBeUndefined();
    const stillStored = txs.get('e-silpo');
    expect(stillStored).toEqual(imported);
    expect(stillStored && 'categoryId' in stillStored && stillStored.categoryId).toBe('groceries');
  });
});

describe('rulesRepo on a file database', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cap1tal-rules-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('Scenario: A renamed, archived and ruled state round-trips', () => {
    const path = join(dir, 'cap1tal.db');
    const ruled: Rule = {
      id: 'r-silpo',
      merchant: 'сільпо',
      mcc: 5411,
      target: { kind: 'category', categoryId: 'groceries' },
      createdAt: created,
    };

    const first = openFileDb(path);
    // The category and source rows are written by hand rather than through their repositories:
    // the subject here is what survives a restart, and these two are the rule's target and the
    // archived neighbour the scenario names.
    first.db.insert(categories).values({ id: 'groceries', name: 'Groceries' }).run();
    first.db
      .update(categories)
      .set({ name: 'Продукти' })
      .where(eq(categories.id, 'groceries'))
      .run();
    first.db.insert(sources).values({ id: 'stypendiya', name: 'степендія', archived: true }).run();
    rulesRepo(first.db).save(ruled);
    first.close();

    const reopened = openFileDb(path);
    try {
      expect(
        reopened.db.select().from(categories).where(eq(categories.id, 'groceries')).get(),
      ).toEqual({ id: 'groceries', name: 'Продукти', archived: false });
      expect(
        reopened.db.select().from(sources).where(eq(sources.id, 'stypendiya')).get(),
      ).toEqual({ id: 'stypendiya', name: 'степендія', archived: true });
      expect(rulesRepo(reopened.db).get('r-silpo')).toEqual(ruled);
    } finally {
      reopened.close();
    }
  });

  it('Scenario: A правило-переказ round-trips', () => {
    const path = join(dir, 'cap1tal-transfer.db');
    const reserve: Rule = {
      id: 'r-reserve',
      merchant: 'округлення балансу',
      target: { kind: 'transfer', toAccountId: 'reserve' },
      createdAt: created,
    };

    const first = openFileDb(path);
    accountsRepo(first.db).save(
      account({ id: 'reserve', name: 'РЕЗЕРВ', kind: 'savings', currency: 'UAH' }),
    );
    rulesRepo(first.db).save(reserve);
    first.close();

    const reopened = openFileDb(path);
    try {
      expect(rulesRepo(reopened.db).get('r-reserve')).toEqual(reserve);
    } finally {
      reopened.close();
    }
  });
});

describe('rulesRepo — the storage half of what the spec promises', () => {
  let storage: TestStorage;
  let repo: RulesRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    repo = rulesRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A rule keeps matching into an archived category — storage keeps it too', () => {
    // Archiving hides a category from pickers, not from rules. Storage must not object to a rule
    // pointing at an archived row, and it must not quietly drop the rule either.
    repo.save(silpo);

    storage.db
      .update(categories)
      .set({ archived: true })
      .where(eq(categories.id, 'groceries'))
      .run();

    expect(repo.get('r-silpo')).toEqual(silpo);
    expect(repo.list()).toEqual([silpo]);
    // And a rule can still be created against a category that is already archived.
    const later: Rule = {
      id: 'r-later',
      merchant: 'сільпо-експрес',
      target: { kind: 'category', categoryId: 'groceries' },
      createdAt: new Date('2026-04-01T10:00:00.000Z'),
    };
    expect(() => repo.save(later)).not.toThrow();
    expect(repo.get('r-later')).toEqual(later);
  });

  it('Scenario: A правило-переказ keeps matching into an archived рахунок — storage keeps it too', () => {
    accountsRepo(storage.db).save(
      account({ id: 'reserve', name: 'РЕЗЕРВ', kind: 'savings', currency: 'UAH' }),
    );
    const reserve: Rule = {
      id: 'r-reserve',
      merchant: 'округлення балансу',
      target: { kind: 'transfer', toAccountId: 'reserve' },
      createdAt: created,
    };
    repo.save(reserve);

    storage.db.update(accounts).set({ archived: true }).where(eq(accounts.id, 'reserve')).run();

    expect(repo.get('r-reserve')).toEqual(reserve);
  });

  it("Scenario: «Коригування» is rejected as a rule's target", () => {
    // «Коригування» is carried only by коригування the app creates for itself; a rule aiming an
    // imported витрата at it would be labelling one transaction type as another.
    expect(() =>
      repo.save({
        ...silpo,
        id: 'r-bad',
        target: { kind: 'category', categoryId: CORRECTION_CATEGORY_ID },
      }),
    ).toThrow('«Коригування»');

    expect(repo.get('r-bad')).toBeUndefined();
  });

  it('Scenario: An MCC that is not a whole number is rejected — at the storage layer too', () => {
    // The column would take 54.11, and the rule would then never match: an MCC is compared for
    // equality against the integer the bank sends.
    expect(() => repo.save({ ...silpo, id: 'r-frac', mcc: 54.11 })).toThrow('MCC');

    expect(repo.get('r-frac')).toBeUndefined();
  });

  it("Scenario: «Без категорії» is rejected as a rule's target", () => {
    // «Без категорії» is the absence of a категорія. A rule aiming at it would pin a merchant to
    // the gap the rules exist to fill, outranking shorter rules that name a real категорія.
    expect(() =>
      repo.save({
        ...silpo,
        id: 'r-gap',
        target: { kind: 'category', categoryId: UNCATEGORISED_CATEGORY_ID },
      }),
    ).toThrow('«Без категорії»');

    expect(repo.get('r-gap')).toBeUndefined();
  });
});

describe('rulesRepo — the розбір a stored правило runs', () => {
  let storage: TestStorage;
  let repo: RulesRepo;
  let transactions: TransactionsRepo;

  /** A stored витрата of the given категорія and опис, on a real рахунок. */
  function store(input: { id: string; categoryId?: string; description?: string }): void {
    transactions.save(
      expenseByDefault({
        id: input.id,
        date: '2026-03-01',
        accountId: 'acc',
        amount: money(12550, 'UAH'),
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(input.description ? { description: input.description } : {}),
      }),
      stored,
    );
  }

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    seedReservedCategories(storage.db);
    accountsRepo(storage.db).save(
      account({ id: 'acc', name: 'Картка', kind: 'spending', currency: 'UAH' }),
    );
    repo = rulesRepo(storage.db);
    transactions = transactionsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A new правило clears the matching витрати out of «Без категорії»', () => {
    store({ id: 't1', description: 'АТБ 421' });
    store({ id: 't2', description: 'АТБ 12' });
    store({ id: 't3', description: 'НОВИЙ ЗАКЛАД' });

    const counts = repo.save({ ...silpo, id: 'r-atb', merchant: 'атб' });

    expect(transactions.get('t1')).toMatchObject({ categoryId: 'groceries' });
    expect(transactions.get('t2')).toMatchObject({ categoryId: 'groceries' });
    expect(transactions.get('t3')).toMatchObject({ categoryId: UNCATEGORISED_CATEGORY_ID });
    expect(counts).toEqual({ examined: 3, moved: 2, transferred: 0, absorbed: 0 });
  });

  it('A moved витрата keeps every other field, its опис and its place among the same date', () => {
    store({ id: 't1', description: 'АТБ 421' });
    const before = transactions.get('t1');

    repo.save({ ...silpo, id: 'r-atb', merchant: 'атб' });

    expect(transactions.get('t1')).toEqual({ ...before, categoryId: 'groceries' });
    // `stored_at` is the tie-break between transactions of one date; a розбір must not reorder the
    // feed. The row's own listing position is what proves it, since the column never leaves storage.
    expect(transactions.listLatest(10).map((t) => t.id)).toEqual(['t1']);
  });

  it('Scenario: A категорія the owner chose is never taken away', () => {
    store({ id: 't1', categoryId: 'eating-out', description: 'АТБ 421' });

    const counts = repo.save({ ...silpo, id: 'r-atb', merchant: 'атб' });

    expect(transactions.get('t1')).toMatchObject({ categoryId: 'eating-out' });
    expect(counts).toEqual({ examined: 0, moved: 0, transferred: 0, absorbed: 0 });
  });

  it('Scenario: A витрата already moved is not swept again', () => {
    store({ id: 't1', description: 'АТБ 421' });
    repo.save({ ...silpo, id: 'r-atb', merchant: 'атб' });

    const counts = repo.save({
      ...silpo,
      id: 'r-atb-421',
      merchant: 'атб 421',
      target: { kind: 'category', categoryId: 'eating-out' },
    });

    expect(transactions.get('t1')).toMatchObject({ categoryId: 'groceries' });
    expect(counts).toEqual({ examined: 0, moved: 0, transferred: 0, absorbed: 0 });
  });

  it('Scenario: A more specific правило keeps the last word during the sweep', () => {
    // The категорія is what the whole set gives the опис, not the target of the правило just
    // written: the longer pattern wins the розбір as it would an import.
    store({ id: 't1', description: 'АТБ 421' });
    repo.save({
      ...silpo,
      id: 'r-atb-421',
      merchant: 'атб 421',
      target: { kind: 'category', categoryId: 'eating-out' },
    });

    // That first store already swept it; start again with both rules present from the outset.
    store({ id: 't2', description: 'АТБ 421' });
    repo.save({ ...silpo, id: 'r-atb', merchant: 'атб' });

    expect(transactions.get('t2')).toMatchObject({ categoryId: 'eating-out' });
  });

  it('Scenario: A повернення is not swept', () => {
    transactions.save(
      refund({
        id: 't1',
        date: '2026-03-01',
        accountId: 'acc',
        amount: money(12550, 'UAH'),
        categoryId: UNCATEGORISED_CATEGORY_ID,
        description: 'АТБ 421',
      }),
      stored,
    );

    repo.save({ ...silpo, id: 'r-atb', merchant: 'атб' });

    expect(transactions.get('t1')).toMatchObject({ categoryId: UNCATEGORISED_CATEGORY_ID });
  });

  it('Scenario: Deleting a правило moves nothing', () => {
    store({ id: 't1', description: 'АТБ 421' });
    repo.save({ ...silpo, id: 'r-atb', merchant: 'атб' });

    repo.remove('r-atb');

    expect(repo.get('r-atb')).toBeUndefined();
    expect(transactions.get('t1')).toMatchObject({ categoryId: 'groceries' });
  });

  it('A refused правило sweeps nothing — the rejection happens before anything is written', () => {
    store({ id: 't1', description: 'АТБ 421' });

    expect(() =>
      repo.save({
        ...silpo,
        id: 'r-bad',
        merchant: 'атб',
        target: { kind: 'category', categoryId: CORRECTION_CATEGORY_ID },
      }),
    ).toThrow();

    expect(repo.list()).toEqual([]);
    expect(transactions.get('t1')).toMatchObject({ categoryId: UNCATEGORISED_CATEGORY_ID });
  });
});

describe('rulesRepo — the розбір turns матching витрати into перекази', () => {
  let storage: TestStorage;
  let repo: RulesRepo;
  let transactions: TransactionsRepo;

  const roundUp: Rule = {
    id: 'r-round-up',
    merchant: 'округлення балансу',
    target: { kind: 'transfer', toAccountId: 'reserve' },
    createdAt: created,
  };

  function storeExpense(input: {
    id: string;
    accountId?: string;
    amount?: number;
    date?: string;
    description?: string;
    categoryId?: string;
  }): void {
    transactions.save(
      expenseByDefault({
        id: input.id,
        date: input.date ?? '2026-09-13',
        accountId: input.accountId ?? 'platinum',
        amount: money(input.amount ?? 479, 'UAH'),
        ...(input.description ? { description: input.description } : {}),
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      }),
      stored,
    );
  }

  function storeUnsourcedIncome(input: {
    id: string;
    accountId: string;
    amount: number;
    date: string;
  }): void {
    const income: Income = {
      type: 'income',
      id: input.id,
      date: input.date,
      accountId: input.accountId,
      amount: money(input.amount, 'UAH'),
      sourceId: UNSOURCED_SOURCE_ID,
    };
    transactions.save(income, stored);
  }

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    seedReservedCategories(storage.db);
    seedReservedSources(storage.db);
    accountsRepo(storage.db).save(
      account({ id: 'platinum', name: 'platinum', kind: 'spending', currency: 'UAH' }),
    );
    accountsRepo(storage.db).save(
      account({ id: 'reserve', name: 'РЕЗЕРВ', kind: 'savings', currency: 'UAH' }),
    );
    repo = rulesRepo(storage.db);
    transactions = transactionsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A new правило-переказ turns matching витрати into перекази', () => {
    storeExpense({ id: 't1', description: 'Округлення балансу «Резерв»' });
    storeUnsourcedIncome({ id: 'i1', accountId: 'reserve', amount: 479, date: '2026-09-13' });

    const counts = repo.save(roundUp);

    const moved = transactions.get('t1');
    expect(moved).toMatchObject({
      type: 'transfer',
      fromAccountId: 'platinum',
      toAccountId: 'reserve',
      left: money(479, 'UAH'),
      arrived: money(479, 'UAH'),
      date: '2026-09-13',
      description: 'Округлення балансу «Резерв»',
    });
    expect((moved as { awaitingCounterpartIncome?: true }).awaitingCounterpartIncome).toBeUndefined();
    // The зустрічний дохід is gone — absorbed, not left beside the переказ.
    expect(transactions.get('i1')).toBeUndefined();
    expect(counts).toEqual({ examined: 1, moved: 0, transferred: 1, absorbed: 1 });
  });

  it('a правило-переказ with no stored зустрічний дохід leaves the переказ awaiting one', () => {
    storeExpense({ id: 't1', description: 'Округлення балансу «Резерв»' });

    const counts = repo.save(roundUp);

    expect(transactions.get('t1')).toMatchObject({ type: 'transfer', awaitingCounterpartIncome: true });
    expect(counts).toEqual({ examined: 1, moved: 0, transferred: 1, absorbed: 0 });
  });

  it('Scenario: A правило-переказ leaves a витрата on its own destination where it is', () => {
    storeExpense({ id: 't1', accountId: 'reserve', description: 'Округлення балансу «Резерв»' });

    const counts = repo.save(roundUp);

    expect(transactions.get('t1')).toMatchObject({ type: 'expense', categoryId: UNCATEGORISED_CATEGORY_ID });
    expect(counts).toEqual({ examined: 1, moved: 0, transferred: 0, absorbed: 0 });
  });

  it('Scenario: A правило-переказ does not take a витрата out of a chosen категорія', () => {
    storeExpense({ id: 't1', description: 'Округлення балансу «Резерв»', categoryId: 'eating-out' });

    const counts = repo.save(roundUp);

    expect(transactions.get('t1')).toMatchObject({ type: 'expense', categoryId: 'eating-out' });
    expect(counts).toEqual({ examined: 0, moved: 0, transferred: 0, absorbed: 0 });
  });

  it('Scenario: A rule retargeted to a переказ runs the розбір', () => {
    // The same rule id, targeting Bills before this витрата exists — its own sweep finds nothing.
    const toBills: Rule = { ...roundUp, target: { kind: 'category', categoryId: 'eating-out' } };
    repo.save(toBills);
    storeExpense({ id: 't1', description: 'Округлення балансу «Резерв»' });
    expect(transactions.get('t1')).toMatchObject({ categoryId: UNCATEGORISED_CATEGORY_ID });

    // Retargeting the same rule to a переказ runs the розбір again, over what is «Без категорії» now.
    repo.save(roundUp);

    expect(transactions.get('t1')).toMatchObject({
      type: 'transfer',
      fromAccountId: 'platinum',
      toAccountId: 'reserve',
    });
  });

  it('main-screen Scenario: Accepting the правило-переказ pairs the history too', () => {
    // Through the offer's accept path: two more «Без категорії» витрати of the same опис sit
    // stored before the правило-переказ this rule *is* gets written — exactly what accepting the
    // offer after a retype does (design D6).
    storeExpense({ id: 't1', description: 'Округлення балансу «Резерв»' });
    storeExpense({ id: 't2', description: 'Округлення балансу «Резерв»' });

    const counts = repo.save(roundUp);

    expect(transactions.get('t1')).toMatchObject({ type: 'transfer', toAccountId: 'reserve' });
    expect(transactions.get('t2')).toMatchObject({ type: 'transfer', toAccountId: 'reserve' });
    expect(counts.transferred).toBe(2);
  });
});
