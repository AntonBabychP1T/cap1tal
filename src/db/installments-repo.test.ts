import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { installmentPartStates, type Installment } from '../domain/installments';
import { money } from '../domain/money';
import { monthlyPicture } from '../domain/monthly-picture';
import { isRefusal } from '../domain/refusal';
import { expenseByDefault, transfer, UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { commitmentsRepo } from './commitments-repo';
import { goalsRepo } from './goals-repo';
import { installmentsRepo, type InstallmentsRepo } from './installments-repo';
import { limitsRepo } from './limits-repo';
import { categories, goalAccounts, goals, installmentReminder, installments } from './schema';
import { storageStamp } from './stored-history';
import {
  openFileDb,
  openTestDb,
  openTestDbMigratedTo,
  seedReferences,
  seedReservedCategories,
  type TestStorage,
} from './test-db';
import { transactionsRepo } from './transactions-repo';

const black = account({ id: 'black', name: 'mono black', kind: 'spending', currency: 'UAH' });
const white = account({ id: 'white', name: 'mono white', kind: 'spending', currency: 'UAH' });
const usd = account({ id: 'usd', name: 'USD', kind: 'spending', currency: 'USD' });
const jar = account({ id: 'jar', name: 'Банка', kind: 'savings', currency: 'UAH' });

const iphone: Installment = {
  id: 'i-iphone',
  name: 'iPhone',
  total: 1_000_000,
  partsCount: 10,
  part: 100_000,
  firstDue: '2026-06-05',
  debitAccountId: 'black',
  paidBefore: 4,
  categoryId: 'tech',
  recordedAt: Date.UTC(2026, 9, 1),
};

const at = new Date(Date.UTC(2026, 9, 1));

describe('installmentsRepo', () => {
  let storage: TestStorage;
  let repo: InstallmentsRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReservedCategories(storage.db);
    seedReferences(storage.db, { categories: ['tech', 'gifts', 'food'] });
    for (const a of [black, white, usd, jar]) {
      accountsRepo(storage.db).save(a);
    }
    repo = installmentsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  const tx = () => transactionsRepo(storage.db);
  const debit = (id: string, date: string, amount: number, over: { accountId?: string; categoryId?: string } = {}) =>
    expenseByDefault({ id, date, accountId: over.accountId ?? 'black', amount: money(amount, 'UAH'), categoryId: over.categoryId });

  describe('storage shape', () => {
    it('Scenario: The switch defaults to on', () => {
      expect(repo.reminder()).toEqual({ enabled: true, asked: false });
    });

    it('keeps the switch and `asked` apart', () => {
      repo.markAsked();
      expect(repo.reminder()).toEqual({ enabled: true, asked: true });
      repo.setReminderEnabled(false);
      expect(repo.reminder()).toEqual({ enabled: false, asked: true });
      expect(storage.db.select().from(installmentReminder).all()).toHaveLength(1);
    });

    it('Scenario: Existing data survives the migration', () => {
      const staged = openTestDbMigratedTo(7);
      try {
        const { db } = staged;
        seedReservedCategories(db);
        seedReferences(db, { categories: ['food'] });
        // Raw SQL over the columns this stage has: the query builder names the current schema's
        // full set, and `accounts.opening_date` arrives only with a later migration (0008).
        for (const a of [black, jar]) {
          db.run(sql`INSERT INTO accounts (id, name, kind, currency, opening_amount, archived)
                     VALUES (${a.id}, ${a.name}, ${a.kind}, ${a.currency}, ${a.openingBalance.amount}, 0)`);
        }
        const accountRows = () =>
          db.all(sql`SELECT id, name, kind, currency, opening_amount, archived FROM accounts ORDER BY id`);
        // Raw SQL too: `transactions.mcc` arrives with a later migration than this stage (0010).
        db.run(sql`INSERT INTO transactions (id, type, date, created_at, account_id, amount, currency, category_id)
                   VALUES ('e1', 'expense', '2026-09-10', ${at.getTime()}, 'black', 12550, 'UAH', 'food')`);
        const transactionRows = () =>
          db.all(sql`SELECT id, type, date, created_at, account_id, amount, currency, category_id, description
                     FROM transactions ORDER BY id`);
        limitsRepo(db).set({ categoryId: 'food', amount: money(500_000, 'UAH') });
        // Written directly, as above: `goalsRepo.save` reads the рахунки it names through the
        // current schema.
        db.insert(goals).values({ id: 'g', name: 'Авто', amount: 1_000_000, currency: 'UAH' }).run();
        db.insert(goalAccounts).values({ goalId: 'g', accountId: 'jar' }).run();
        const before = {
          accounts: accountRows(),
          categories: db.select().from(categories).all(),
          transactions: transactionRows(),
          limits: limitsRepo(db).list(),
          goals: goalsRepo(db).list(),
        };

        staged.migrateToLatest();

        expect({
          accounts: accountRows(),
          categories: db.select().from(categories).all(),
          transactions: transactionRows(),
          limits: limitsRepo(db).list(),
          goals: goalsRepo(db).list(),
        }).toEqual(before);
        expect(db.select().from(installments).all()).toEqual([]);
        expect(installmentsRepo(db).reminder()).toEqual({ enabled: true, asked: false });
      } finally {
        staged.close();
      }
    });
  });

  describe('store, edit, close, reopen, delete', () => {
    it('Scenario: A розстрочка comes back whole', () => {
      const file = openFileStorage();
      try {
        const first = file.open();
        seedReservedCategories(first.db);
        seedReferences(first.db, { categories: ['tech'] });
        accountsRepo(first.db).save(black);
        const r = installmentsRepo(first.db);
        r.save(iphone);
        transactionsRepo(first.db).save(debit('t5', '2026-10-05', 100_000), at);
        r.settle('2026-10-05');
        transactionsRepo(first.db).save(debit('t7', '2026-12-05', 100_000), at);
        r.mark(iphone.id, 6);
        r.link(iphone.id, 7, 't7');
        r.unlink(iphone.id, 7);
        first.close();

        const second = file.open();
        const again = installmentsRepo(second.db);
        expect(again.get(iphone.id)).toEqual(iphone);
        expect(again.facts()).toEqual({
          links: [{ installmentId: iphone.id, number: 5, transactionId: 't5' }],
          marks: [{ installmentId: iphone.id, number: 6 }],
          refusals: [{ installmentId: iphone.id, number: 7, transactionId: 't7' }],
        });
        second.close();
      } finally {
        file.remove();
      }
    });

    it('Scenario: A non-UAH рахунок списання is rejected', () => {
      expect(() => repo.save({ ...iphone, debitAccountId: 'usd' })).toThrowError(
        'Рахунок списання має бути в гривнях.',
      );
      expect(repo.list()).toEqual([]);
    });

    it('rejects a рахунок списання or категорія storage does not hold, as a refusal', () => {
      for (const broken of [{ ...iphone, debitAccountId: 'nowhere' }, { ...iphone, categoryId: 'nothing' }]) {
        let thrown: unknown;
        try {
          repo.save(broken);
        } catch (error) {
          thrown = error;
        }
        expect(isRefusal(thrown)).toBe(true);
      }
      expect(repo.list()).toEqual([]);
    });

    it('Scenario: Deleting a розстрочка leaves its транзакції', () => {
      repo.save(iphone);
      const t5 = debit('t5', '2026-10-05', 100_000);
      const t6 = debit('t6', '2026-11-05', 100_000, { categoryId: 'gifts' });
      tx().save(t5, at);
      tx().save(t6, at);
      repo.settle('2026-11-05');
      expect(repo.facts().links).toHaveLength(2);
      const linkedBefore = [tx().get('t5'), tx().get('t6')];

      repo.remove(iphone.id);

      expect(repo.list()).toEqual([]);
      expect(repo.facts()).toEqual({ links: [], marks: [], refusals: [] });
      expect([tx().get('t5'), tx().get('t6')]).toEqual(linkedBefore);
    });

    it('Scenario: Recording a розстрочка moves no number', () => {
      tx().save(debit('t1', '2026-10-02', 250_000, { categoryId: 'food' }), at);
      const picture = () =>
        monthlyPicture({
          month: '2026-10',
          accounts: accountsRepo(storage.db).list(),
          transactions: tx().listAll(),
        });
      const before = picture();
      repo.save({ ...iphone, firstDue: '2026-10-01', paidBefore: 0 });
      expect(picture()).toEqual(before);
      expect(tx().listAll()).toHaveLength(1);
    });

    it('Scenario: Shortening a розстрочка drops the extra платежі', () => {
      const twelve = { ...iphone, partsCount: 12, part: 80_000, total: 960_000, paidBefore: 0 };
      repo.save(twelve);
      repo.mark(iphone.id, 11);
      repo.save({ ...twelve, partsCount: 10, total: 800_000 });
      expect(repo.facts().marks).toEqual([]);
    });

    it('Scenario: Moving the рахунок списання drops links on the old one', () => {
      repo.save(iphone);
      tx().save(debit('t5', '2026-10-05', 100_000), at);
      repo.settle('2026-10-05');
      expect(repo.facts().links).toHaveLength(1);
      repo.save({ ...iphone, debitAccountId: 'white' });
      expect(repo.facts().links).toEqual([]);
    });

    it('Scenario: Moving the дата першого платежу drops a far link', () => {
      repo.save(iphone);
      tx().save(debit('t5', '2026-10-05', 100_000), at);
      repo.settle('2026-10-05');
      expect(repo.facts().links).toHaveLength(1);
      // Платіж 5 moves to 2026-10-20 — fifteen days from its списання.
      repo.save({ ...iphone, firstDue: '2026-06-20' });
      expect(repo.facts().links).toEqual([]);
      // Within ten days it stays.
      repo.save(iphone);
      repo.settle('2026-10-05');
      repo.save({ ...iphone, firstDue: '2026-06-12' });
      expect(repo.facts().links).toHaveLength(1);
    });

    it('closes early and reopens', () => {
      repo.save(iphone);
      repo.close(iphone.id, '2026-10-02');
      expect(repo.get(iphone.id)?.closedOn).toBe('2026-10-02');
      repo.reopen(iphone.id);
      expect(repo.get(iphone.id)?.closedOn).toBeUndefined();
    });
  });

  describe('links, marks and refusals', () => {
    beforeEach(() => {
      repo.save(iphone);
    });

    it('Scenario: A транзакція links to one платіж at most', () => {
      const vacuum: Installment = {
        id: 'i-vacuum',
        name: 'Пилосос',
        total: 300_000,
        partsCount: 3,
        part: 100_000,
        firstDue: '2026-10-05',
        debitAccountId: 'black',
        paidBefore: 0,
        recordedAt: iphone.recordedAt + 1,
      };
      repo.save(vacuum);
      tx().save(debit('t5', '2026-10-05', 100_000), at);
      repo.settle('2026-10-05');
      expect(repo.facts().links).toEqual([{ installmentId: iphone.id, number: 5, transactionId: 't5' }]);

      expect(() => repo.link(vacuum.id, 1, 't5')).toThrowError('вже є списанням');
      expect(repo.facts().links).toEqual([{ installmentId: iphone.id, number: 5, transactionId: 't5' }]);
    });

    it("Scenario: A витрата linked to a зобов'язання is not offered", () => {
      seedReferences(storage.db, { categories: ['telecom'] });
      const commitments = commitmentsRepo(storage.db);
      commitments.save({
        id: 'c-internet',
        name: 'Інтернет',
        amount: 30_000,
        currency: 'UAH',
        periodicity: 'monthly',
        firstDue: '2026-10-05',
        debitAccountId: 'black',
        recordedAt: 1,
      });
      tx().save(debit('internet', '2026-10-06', 30_000), at);
      tx().save(debit('free', '2026-10-07', 99_000), at);
      commitments.link('c-internet', 1, 'internet');
      expect(repo.choices(iphone.id, 5).map((c) => c.id)).toEqual(['free']);
    });

    it("Scenario: A витрата already linked to a зобов'язання is not taken", () => {
      const commitments = commitmentsRepo(storage.db);
      commitments.save({
        id: 'c-gym',
        name: 'Спортзал',
        amount: 100_000,
        currency: 'UAH',
        periodicity: 'monthly',
        firstDue: '2026-10-05',
        debitAccountId: 'black',
        recordedAt: 1,
      });
      tx().save(debit('gym', '2026-10-05', 100_000), at);
      commitments.link('c-gym', 1, 'gym');
      expect(repo.settle('2026-10-05')).toBe(false);
      expect(repo.facts().links).toEqual([]);
      expect(commitments.facts().links).toEqual([{ commitmentId: 'c-gym', number: 1, transactionId: 'gym' }]);
    });

    it('rejects linking a транзакція that is absent, not a UAH витрата, or on another рахунок', () => {
      tx().save(debit('white', '2026-10-05', 100_000, { accountId: 'white' }), at);
      tx().save(
        transfer({
          id: 'move',
          date: '2026-10-05',
          fromAccountId: 'black',
          toAccountId: 'jar',
          left: money(100_000, 'UAH'),
          arrived: money(100_000, 'UAH'),
        }),
        at,
      );
      expect(() => repo.link(iphone.id, 5, 'nothing')).toThrow();
      expect(() => repo.link(iphone.id, 5, 'white')).toThrowError('витрата в гривнях з рахунку списання');
      expect(() => repo.link(iphone.id, 5, 'move')).toThrowError('витрата в гривнях з рахунку списання');
      expect(repo.facts().links).toEqual([]);
    });

    it('Scenario: A removed транзакція releases its link', () => {
      tx().save(debit('t5', '2026-10-05', 100_000), at);
      repo.settle('2026-10-05');
      expect(() => tx().remove('t5')).not.toThrow();
      expect(repo.facts().links).toEqual([]);
      expect(repo.get(iphone.id)).toEqual(iphone);
    });

    it('Scenario: A debit of another сума picked by hand', () => {
      tx().save(debit('odd', '2026-10-06', 100_050), at);
      repo.settle('2026-10-09');
      const before = installmentPartStates(iphone, repo.facts(), '2026-10-09');
      expect(before.parts[4]?.state).toBe('notFound');
      expect(repo.choices(iphone.id, 5).map((c) => c.id)).toEqual(['odd']);

      repo.link(iphone.id, 5, 'odd');

      const after = installmentPartStates(iphone, repo.facts(), '2026-10-09');
      expect(after.parts[4]).toMatchObject({ state: 'paid', reason: 'debit', transactionId: 'odd' });
      expect(before.remaining - after.remaining).toBe(100_000);
    });

    it("Scenario: A hand-picked витрата without a категорія takes the розстрочка's", () => {
      tx().save(debit('odd', '2026-10-06', 100_050), at);
      tx().save(debit('kept', '2026-11-06', 99_000, { categoryId: 'gifts' }), at);
      repo.link(iphone.id, 5, 'odd');
      repo.link(iphone.id, 6, 'kept');
      expect(tx().get('odd')).toMatchObject({ categoryId: 'tech' });
      expect(tx().get('kept')).toMatchObject({ categoryId: 'gifts' });
    });

    it('Scenario: An unlinked debit is not taken back', () => {
      tx().save(debit('t5', '2026-10-05', 100_000), at);
      repo.settle('2026-10-05');
      repo.unlink(iphone.id, 5);
      expect(repo.settle('2026-10-06')).toBe(false);
      expect(repo.facts().links).toEqual([]);
      // The категорія it took stays.
      expect(tx().get('t5')).toMatchObject({ categoryId: 'tech' });
    });

    it('Scenario: Marked as paid without a debit', () => {
      repo.mark(iphone.id, 5);
      expect(installmentPartStates(iphone, repo.facts(), '2026-10-20').parts[4]?.state).toBe('paid');
      repo.unmark(iphone.id, 5);
      expect(installmentPartStates(iphone, repo.facts(), '2026-10-20').parts[4]?.state).toBe('notFound');
    });
  });

  describe('settle', () => {
    beforeEach(() => {
      repo.save({ ...iphone, firstDue: '2026-10-05', paidBefore: 0 });
    });

    it('Scenario: Each платіж is the витрата of its own month', () => {
      tx().save(debit('oct', '2026-10-05', 100_000), at);
      tx().save(debit('nov', '2026-11-05', 100_000), at);
      expect(repo.settle('2026-11-05')).toBe(true);
      expect(repo.facts().links.map((l) => [l.number, l.transactionId])).toEqual([
        [1, 'oct'],
        [2, 'nov'],
      ]);
      expect(tx().get('oct')).toMatchObject({ categoryId: 'tech' });
      for (const month of ['2026-10', '2026-11']) {
        const picture = monthlyPicture({
          month,
          accounts: accountsRepo(storage.db).list(),
          transactions: tx().listAll(),
        });
        expect(picture.get('UAH')?.spent).toEqual(money(100_000, 'UAH'));
      }
    });

    it('Scenario: A deleted debit releases its платіж', () => {
      tx().save(debit('oct', '2026-10-05', 100_000), at);
      repo.settle('2026-10-05');
      tx().remove('oct');
      repo.settle('2026-10-20');
      const status = installmentPartStates(repo.get(iphone.id)!, repo.facts(), '2026-10-20');
      expect(status.parts[0]?.state).toBe('notFound');
    });

    it('Scenario: A debit retyped as a переказ releases its платіж', () => {
      tx().save(debit('oct', '2026-10-05', 100_000), at);
      repo.settle('2026-10-05');
      repo.close(iphone.id, '2026-10-06');
      tx().save(
        transfer({
          id: 'oct',
          date: '2026-10-05',
          fromAccountId: 'black',
          toAccountId: 'jar',
          left: money(100_000, 'UAH'),
          arrived: money(100_000, 'UAH'),
        }),
        at,
      );
      // Drops are checked over every розстрочка, the closed one included.
      expect(repo.settle('2026-10-06')).toBe(true);
      expect(repo.facts().links).toEqual([]);
    });

    it('leaves the storage stamp unchanged when there is nothing to do', () => {
      tx().save(debit('oct', '2026-10-05', 100_000), at);
      repo.settle('2026-10-05');
      const stamp = storageStamp(storage.db);
      expect(repo.settle('2026-10-06')).toBe(false);
      expect(storageStamp(storage.db)).toBe(stamp);
    });

    it("Scenario: The owner's категорія after linking stands", () => {
      tx().save(debit('oct', '2026-10-05', 100_000), at);
      repo.settle('2026-10-05');
      tx().setCategory('oct', UNCATEGORISED_CATEGORY_ID);
      expect(repo.settle('2026-10-06')).toBe(false);
      expect(tx().get('oct')).toMatchObject({ categoryId: UNCATEGORISED_CATEGORY_ID });
      expect(repo.facts().links).toHaveLength(1);
    });

    it('ignores a candidate of another сума even when the window is wide', () => {
      tx().save(debit('odd', '2026-10-05', 100_001), at);
      expect(repo.settle('2026-10-05')).toBe(false);
    });
  });

  it('rejects writing a USD row directly, by the CHECK', () => {
    expect(() =>
      storage.db
        .insert(installments)
        .values({
          id: 'x',
          name: 'x',
          totalMinor: 100,
          currency: 'USD',
          partsCount: 2,
          partMinor: 50,
          firstDue: '2026-10-01',
          debitAccountId: 'usd',
          paidBefore: 0,
          recordedAt: at,
        })
        .run(),
    ).toThrow();
    expect(storage.db.select().from(installments).where(eq(installments.id, 'x')).all()).toEqual([]);
  });
});

/** A file-backed database reopened between steps — what "storage is closed and reopened" means. */
function openFileStorage() {
  const dir = mkdtempSync(join(tmpdir(), 'cap1tal-installments-'));
  const file = join(dir, 'db.sqlite');
  return {
    open: () => openFileDb(file),
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}
