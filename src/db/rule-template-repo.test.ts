import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { TEMPLATE_GROUPS, TEMPLATE_VERSION } from '../domain/rule-template';
import { resolveCategory, type Rule } from '../domain/rules';
import { UNCATEGORISED_CATEGORY_ID, expenseByDefault } from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { categorisationContext, templateTargets } from './categorisation';
import { ruleTemplateRepo, type RuleTemplateRepo } from './rule-template-repo';
import { rulesRepo } from './rules-repo';
import { categories, ruleTemplateChoices, ruleTemplateSweep } from './schema';
import { RESERVED_CATEGORIES, STARTER_CATEGORIES } from './starter-set';
import {
  openTestDb,
  seedReferences,
  seedReservedCategories,
  type TestStorage,
} from './test-db';
import { transactionsRepo } from './transactions-repo';

const AT = new Date('2026-10-01T09:00:00.000Z');
const card = account({ id: 'card', name: 'Картка', kind: 'spending', currency: 'UAH' });

/** The starter rows the типові категорії point at, plus the owner's own «Їжа». */
const VOCABULARY = {
  categories: ['groceries', 'eating-out', 'home', 'habits', 'transport', 'food-delivery', 'yizha'],
} as const;

describe('ruleTemplateRepo', () => {
  let storage: TestStorage;
  let repo: RuleTemplateRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReservedCategories(storage.db);
    seedReferences(storage.db, VOCABULARY);
    accountsRepo(storage.db).save(card);
    repo = ruleTemplateRepo(storage.db);
  });
  afterEach(() => storage.close());

  const storeExpense = (id: string, description: string, categoryId?: string) =>
    transactionsRepo(storage.db).save(
      expenseByDefault({
        id,
        date: '2026-09-30',
        accountId: card.id,
        amount: money(4_200, 'UAH'),
        description,
        ...(categoryId ? { categoryId } : {}),
      }),
      AT,
    );
  const categoryOf = (id: string) => {
    const t = transactionsRepo(storage.db).get(id)!;
    return t.type === 'expense' ? t.categoryId : undefined;
  };

  describe('the mapping', () => {
    it('every типова категорія is a starter row the app seeds, and none is reserved', () => {
      const starter = new Set(STARTER_CATEGORIES.map((row) => row.id));
      const reserved = new Set(RESERVED_CATEGORIES.map((row) => row.id));
      for (const group of TEMPLATE_GROUPS) {
        expect(starter.has(group.defaultCategoryId), group.id).toBe(true);
        expect(reserved.has(group.defaultCategoryId), group.id).toBe(false);
      }
    });

    it('Scenario: A choice is read back after a restart / The choice survives a restart', () => {
      repo.choose('groceries', { kind: 'category', categoryId: 'yizha' }, AT);
      repo.choose('habits', { kind: 'off' }, AT);

      // A fresh repository over the same storage is what the app has after a restart.
      const reopened = ruleTemplateRepo(storage.db);
      expect(reopened.choices()).toEqual(
        new Map([
          ['groceries', { kind: 'category', categoryId: 'yizha' }],
          ['habits', { kind: 'off' }],
        ]),
      );
      // Every other базова категорія reads back as untouched: no row at all.
      expect(storage.db.select().from(ruleTemplateChoices).all()).toHaveLength(2);
    });

    it('Scenario: One choice per базова категорія', () => {
      repo.choose('groceries', { kind: 'category', categoryId: 'yizha' }, AT);
      repo.choose('groceries', { kind: 'category', categoryId: 'groceries' }, AT);

      expect(storage.db.select().from(ruleTemplateChoices).all()).toEqual([
        { groupId: 'groceries', categoryId: 'groceries' },
      ]);
    });

    it('Scenario: A категорія a choice points at cannot be deleted out from under it', () => {
      repo.choose('groceries', { kind: 'category', categoryId: 'yizha' }, AT);

      expect(() =>
        storage.db.delete(categories).where(eq(categories.id, 'yizha')).run(),
      ).toThrow(/FOREIGN KEY/i);
      expect(storage.db.select().from(categories).where(eq(categories.id, 'yizha')).get()).toBeDefined();
      expect(repo.choices().get('groceries')).toEqual({ kind: 'category', categoryId: 'yizha' });
    });

    it('Scenario: A target that no longer exists matches nothing', () => {
      // «Подорожі» lands in `travel` by default, and this device holds no such row.
      expect(templateTargets(storage.db).has('travel')).toBe(false);
      const context = categorisationContext(storage.db);
      expect(resolveCategory(context, { description: 'RYANAIR' })).toBe(undefined);
      // The rest of the шаблон still answers.
      expect(resolveCategory(context, { description: 'АТБ 421' })).toBe('groceries');
    });

    it('Scenario: An untouched базова категорія uses its типова категорія', () => {
      repo.choose('groceries', { kind: 'category', categoryId: 'yizha' }, AT);
      const context = categorisationContext(storage.db);

      expect(resolveCategory(context, { description: 'АТБ 421' })).toBe('yizha');
      expect(resolveCategory(context, { description: 'АВРОРА' })).toBe('home');
    });

    it('Scenario: A switched-off базова категорія matches nothing', () => {
      repo.choose('habits', { kind: 'off' }, AT);

      expect(
        resolveCategory(categorisationContext(storage.db), { description: 'НОВИЙ ЗАКЛАД', mcc: 5921 }),
      ).toBe(undefined);
    });

    it('an archived target keeps matching', () => {
      storage.db.update(categories).set({ archived: true }).where(eq(categories.id, 'yizha')).run();
      repo.choose('groceries', { kind: 'category', categoryId: 'yizha' }, AT);

      expect(resolveCategory(categorisationContext(storage.db), { description: 'АТБ 421' })).toBe(
        'yizha',
      );
    });

    it('ignores a stored choice for a базова категорія the шаблон does not carry, and keeps it', () => {
      storage.db.insert(ruleTemplateChoices).values({ groupId: 'gone', categoryId: 'yizha' }).run();

      expect([...templateTargets(storage.db).values()]).not.toContain('yizha');
      repo.choose('groceries', { kind: 'off' }, AT);
      expect(repo.choices().get('gone')).toEqual({ kind: 'category', categoryId: 'yizha' });
    });

    it('refuses an unknown базова категорія and a reserved категорія', () => {
      expect(() => repo.choose('gone', { kind: 'off' }, AT)).toThrow(/базової категорії немає/);
      expect(() =>
        repo.choose('groceries', { kind: 'category', categoryId: UNCATEGORISED_CATEGORY_ID }, AT),
      ).toThrow(/службову/);
      expect(repo.choices()).toEqual(new Map());
    });
  });

  describe('the розбір a choice runs', () => {
    it('Scenario: Changing a mapping sweeps «Без категорії»', () => {
      repo.choose('groceries', { kind: 'off' }, AT);
      storeExpense('t1', 'АТБ 421');
      expect(categoryOf('t1')).toBe(UNCATEGORISED_CATEGORY_ID);

      const counts = repo.choose('groceries', { kind: 'category', categoryId: 'groceries' }, AT);

      expect(categoryOf('t1')).toBe('groceries');
      expect(counts).toEqual({ examined: 1, moved: 1, transferred: 0, absorbed: 0, incomesExamined: 0, incomesSourced: 0 });
    });

    it('Scenario: Switching a базова категорія off takes nothing back', () => {
      storeExpense('t1', 'АТБ 421');
      repo.choose('home', { kind: 'off' }, AT); // any choice sweeps: АТБ lands in Groceries
      expect(categoryOf('t1')).toBe('groceries');

      const counts = repo.choose('groceries', { kind: 'off' }, AT);

      expect(categoryOf('t1')).toBe('groceries');
      expect(counts.moved).toBe(0);
    });

    it('Scenario: The шаблон fills what the new правило does not', () => {
      storeExpense('t1', 'АТБ 421');
      storeExpense('t2', 'НОВИЙ ЗАКЛАД 7');
      const fresh: Rule = {
        id: 'r1',
        merchant: 'новий заклад',
        target: { kind: 'category', categoryId: 'eating-out' },
        createdAt: AT,
      };

      const counts = rulesRepo(storage.db).save(fresh);

      expect(categoryOf('t1')).toBe('groceries');
      expect(categoryOf('t2')).toBe('eating-out');
      expect(counts).toEqual({ examined: 2, moved: 2, transferred: 0, absorbed: 0, incomesExamined: 0, incomesSourced: 0 });
    });

    it('Scenario: An MCC-only правило moves nothing', () => {
      storeExpense('t1', 'НОВИЙ ЗАКЛАД 7');
      rulesRepo(storage.db).save({
        id: 'r1',
        mcc: 5411,
        target: { kind: 'category', categoryId: 'groceries' },
        createdAt: AT,
      });

      expect(categoryOf('t1')).toBe(UNCATEGORISED_CATEGORY_ID);
    });
  });

  describe('the open-time розбір', () => {
    it('Scenario: The first open after an update clears what it can', () => {
      // Forty «Без категорії» витрати, eleven of which the шаблон knows.
      const known = ['АТБ 421', 'СІЛЬПО 5', 'UKLON', 'Уклон', 'BOLT FOOD', 'АВРОРА', 'WINETIME'];
      for (let i = 0; i < 11; i += 1) storeExpense(`k${i}`, known[i % known.length]!);
      for (let i = 0; i < 29; i += 1) storeExpense(`u${i}`, `НОВИЙ ЗАКЛАД ${i}`);

      const counts = repo.sweepIfTemplateChanged(AT);

      expect(counts).toEqual({ examined: 40, moved: 11, transferred: 0, absorbed: 0, incomesExamined: 0, incomesSourced: 0 });
      expect(categoryOf('k0')).toBe('groceries');
      expect(categoryOf('k2')).toBe('transport');
      expect(categoryOf('k4')).toBe('food-delivery');
      expect(categoryOf('k5')).toBe('home');
      expect(categoryOf('k6')).toBe('habits');
      for (let i = 0; i < 29; i += 1) expect(categoryOf(`u${i}`)).toBe(UNCATEGORISED_CATEGORY_ID);
      expect(repo.sweptVersion()).toBe(TEMPLATE_VERSION);
    });

    it('Scenario: Opening again sweeps nothing', () => {
      expect(repo.sweepIfTemplateChanged(AT)).toBeDefined();
      storeExpense('t1', 'АТБ 421'); // as if stored under a mapping since switched; still a gap

      expect(repo.sweepIfTemplateChanged(AT)).toBe(undefined);
      expect(categoryOf('t1')).toBe(UNCATEGORISED_CATEGORY_ID);
    });

    it('Scenario: A new шаблон version reaches the pile again', () => {
      // The device last swept under an older шаблон; this app carries a newer one.
      storage.db.insert(ruleTemplateSweep).values({ id: 'sweep', version: TEMPLATE_VERSION - 1 }).run();
      storeExpense('t1', 'АТБ 421');

      expect(repo.sweepIfTemplateChanged(AT)?.moved).toBe(1);
      expect(categoryOf('t1')).toBe('groceries');
      expect(repo.sweptVersion()).toBe(TEMPLATE_VERSION);
    });

    it('Scenario: A категорія the owner chose is still never taken away', () => {
      storeExpense('t1', 'АТБ 421', 'eating-out');

      repo.sweepIfTemplateChanged(AT);

      expect(categoryOf('t1')).toBe('eating-out');
    });

    it('a sweep that fails leaves the version unrecorded, so the next open tries again', () => {
      storeExpense('t1', 'АТБ 421');
      // The write of the move itself fails, inside the sweep's own transaction.
      storage.db.run(sql`CREATE TRIGGER refuse_moves BEFORE UPDATE ON transactions
                         BEGIN SELECT RAISE(ABORT, 'disk full'); END`);

      expect(() => repo.sweepIfTemplateChanged(AT)).toThrow(/disk full/);
      expect(repo.sweptVersion()).toBe(undefined);
      expect(categoryOf('t1')).toBe(UNCATEGORISED_CATEGORY_ID);

      storage.db.run(sql`DROP TRIGGER refuse_moves`);
      expect(repo.sweepIfTemplateChanged(AT)?.moved).toBe(1);
      expect(repo.sweptVersion()).toBe(TEMPLATE_VERSION);
    });
  });
});
