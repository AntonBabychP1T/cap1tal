import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { matchRule, type Rule } from '../domain/rules';
import { CORRECTION_CATEGORY_ID, expenseByDefault } from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { rulesRepo, type RulesRepo } from './rules-repo';
import { categories, sources } from './schema';
import { openFileDb, openTestDb, seedReferences, type TestStorage } from './test-db';
import { transactionsRepo, type TransactionsRepo } from './transactions-repo';

/** The categories these rules target. Their names are their ids — see seedReferences. */
const VOCABULARY = { categories: ['groceries', 'eating-out'] } as const;

/** A fixed instant: a rule's creation moment is data these tests control, never the wall clock. */
const created = new Date('2026-03-01T10:00:00.000Z');

const silpo: Rule = {
  id: 'r-silpo',
  merchant: 'сільпо',
  categoryId: 'groceries',
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
    expect(stored?.categoryId).toBe('groceries');
    expect(stored?.mcc).toBeUndefined();
    expect(repo.list()).toEqual([silpo]);
  });

  it('Scenario: A rule with no criterion is rejected', () => {
    const criterionless: Rule = { id: 'r-empty', categoryId: 'groceries', createdAt: created };

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
    expect(() => repo.save({ ...silpo, categoryId: 'no-such-category' })).toThrow(/FOREIGN KEY/i);

    expect(repo.list()).toEqual([]);
  });

  it('Scenario: An edited rule carries its new target', () => {
    repo.save(silpo);

    repo.save({ ...silpo, categoryId: 'eating-out' });

    expect(repo.get('r-silpo')?.categoryId).toBe('eating-out');
    expect(repo.get('r-silpo')?.merchant).toBe('сільпо');
    // Editing replaces the rule; it does not add a second one under a new id.
    expect(repo.list()).toHaveLength(1);
  });

  it('A merchant pattern is stored trimmed', () => {
    repo.save({ ...silpo, merchant: '  сільпо  ' });

    expect(repo.get('r-silpo')?.merchant).toBe('сільпо');
  });

  it('A merchant pattern that is blank after trimming counts as absent', () => {
    repo.save({ id: 'r-mcc', merchant: '   ', mcc: 5411, categoryId: 'groceries', createdAt: created });

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
      categoryId: 'groceries',
      createdAt: created,
    };
    const later = new Date('2026-03-05T08:30:00.000Z');
    const both: Rule = {
      id: 'r-both',
      merchant: 'уклон',
      mcc: 4121,
      categoryId: 'eating-out',
      createdAt: later,
    };
    // Created in the same millisecond as `both`: the id is what keeps the order total.
    const twinA: Rule = { id: 'r-a', merchant: 'атб', categoryId: 'eating-out', createdAt: later };
    const twinB: Rule = { id: 'r-b', merchant: 'атб', categoryId: 'groceries', createdAt: later };

    // Saved out of order, so the listing proves the ordering and not the insertion sequence.
    repo.save(both);
    repo.save(twinB);
    repo.save(mccOnly);
    repo.save(twinA);

    expect(repo.list()).toEqual([mccOnly, twinA, twinB, both]);
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
    // The link the scenario rests on: this is the description the rule matched, and `matchRule`
    // — the very function an importer calls — is what says the rule is why the витрата carries
    // Groceries. Without this the test would only be storing a category by hand and deleting an
    // unrelated row.
    const description = 'Оплата картою СІЛЬПО';
    expect(matchRule(repo.list(), { description })).toBe('groceries');
    const imported = expenseByDefault({
      id: 'e-silpo',
      date: '2026-03-02',
      accountId: 'card',
      amount: money(24500, 'UAH'),
      categoryId: matchRule(repo.list(), { description })!,
    });
    txs.save(imported, storedAt);

    repo.remove('r-silpo');

    expect(repo.get('r-silpo')).toBeUndefined();
    expect(repo.list()).toEqual([]);
    // The same description would now find no rule — and the витрата it already categorised is
    // untouched, because a rule acts at import time and never retroactively.
    expect(matchRule(repo.list(), { description })).toBeUndefined();
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
      categoryId: 'groceries',
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
      categoryId: 'groceries',
      createdAt: new Date('2026-04-01T10:00:00.000Z'),
    };
    expect(() => repo.save(later)).not.toThrow();
    expect(repo.get('r-later')).toEqual(later);
  });

  it("Scenario: «Коригування» is rejected as a rule's target", () => {
    // «Коригування» is carried only by коригування the app creates for itself; a rule aiming an
    // imported витрата at it would be labelling one transaction type as another.
    expect(() =>
      repo.save({ ...silpo, id: 'r-bad', categoryId: CORRECTION_CATEGORY_ID }),
    ).toThrow('«Коригування»');

    expect(repo.get('r-bad')).toBeUndefined();
  });

  it('Scenario: An MCC that is not a whole number is rejected — at the storage layer too', () => {
    // The column would take 54.11, and the rule would then never match: an MCC is compared for
    // equality against the integer the bank sends.
    expect(() => repo.save({ ...silpo, id: 'r-frac', mcc: 54.11 })).toThrow('MCC');

    expect(repo.get('r-frac')).toBeUndefined();
  });
});
