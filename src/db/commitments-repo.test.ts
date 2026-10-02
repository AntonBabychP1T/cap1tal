import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { commitmentDues, firstDueAfter, type Commitment } from '../domain/commitments';
import type { Installment } from '../domain/installments';
import { money } from '../domain/money';
import { monthlyPicture } from '../domain/monthly-picture';
import { isRefusal } from '../domain/refusal';
import { expenseByDefault, transfer } from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { commitmentsRepo, type CommitmentsRepo } from './commitments-repo';
import { installmentsRepo } from './installments-repo';
import { settlePlans } from './plans-settle';
import { commitments } from './schema';
import { openFileDb, openTestDb, seedReferences, seedReservedCategories, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

const black = account({ id: 'black', name: 'mono black', kind: 'spending', currency: 'UAH' });
const white = account({ id: 'white', name: 'mono white', kind: 'spending', currency: 'UAH' });
const usd = account({ id: 'usd', name: 'mono USD', kind: 'spending', currency: 'USD' });
const jar = account({ id: 'jar', name: 'Банка', kind: 'savings', currency: 'UAH' });

const netflix: Commitment = {
  id: 'c-netflix',
  name: 'Netflix',
  amount: 29_900,
  currency: 'UAH',
  periodicity: 'monthly',
  firstDue: '2026-08-15',
  debitAccountId: 'black',
  categoryId: 'subscriptions',
  marker: 'netflix',
  recordedAt: Date.UTC(2026, 7, 1),
};

const internet: Commitment = {
  id: 'c-internet',
  name: 'Інтернет',
  amount: 30_000,
  currency: 'UAH',
  periodicity: 'monthly',
  firstDue: '2026-10-05',
  debitAccountId: 'black',
  categoryId: 'telecom',
  recordedAt: Date.UTC(2026, 9, 1),
};

const at = new Date(Date.UTC(2026, 9, 1));

const debit = (
  id: string,
  date: string,
  amount: number,
  over: { accountId?: string; categoryId?: string; description?: string; currency?: string } = {},
) =>
  expenseByDefault({
    id,
    date,
    accountId: over.accountId ?? 'black',
    amount: money(amount, over.currency ?? 'UAH'),
    ...(over.categoryId ? { categoryId: over.categoryId } : {}),
    ...(over.description ? { description: over.description } : {}),
  });

function seed(db: TestStorage['db']) {
  seedReservedCategories(db);
  seedReferences(db, { categories: ['subscriptions', 'telecom', 'work', 'tech'] });
  for (const a of [black, white, usd, jar]) {
    accountsRepo(db).save(a);
  }
}

describe('commitmentsRepo', () => {
  let storage: TestStorage;
  let repo: CommitmentsRepo;

  beforeEach(() => {
    storage = openTestDb();
    seed(storage.db);
    repo = commitmentsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  const tx = () => transactionsRepo(storage.db);
  const settle = (today: string) => settlePlans(storage.db, today);

  describe('commitments — store, edit, stop, resume, delete', () => {
    it("Scenario: A complete зобов'язання is stored", () => {
      repo.save({ ...netflix, firstDue: '2026-10-15', marker: '  netflix ' });
      expect(repo.get(netflix.id)).toEqual({ ...netflix, firstDue: '2026-10-15', marker: 'netflix' });
    });

    it("Scenario: A зобов'язання on a USD card is in dollars", () => {
      const chatgpt: Commitment = { ...internet, id: 'c-gpt', name: 'ChatGPT', amount: 2_000, currency: 'USD', debitAccountId: 'usd' };
      repo.save(chatgpt);
      expect(repo.get('c-gpt')).toMatchObject({ amount: 2_000, currency: 'USD' });
    });

    it("Scenario: A currency other than the рахунок's is rejected", () => {
      let thrown: unknown;
      try {
        repo.save({ ...internet, amount: 2_000, currency: 'USD' });
      } catch (error) {
        thrown = error;
      }
      expect(isRefusal(thrown)).toBe(true);
      expect(repo.list()).toEqual([]);
    });

    it('rejects a рахунок списання or категорія storage does not hold, and a two-letter ознака', () => {
      for (const broken of [
        { ...internet, debitAccountId: 'nowhere' },
        { ...internet, categoryId: 'nothing' },
        { ...internet, marker: 'tv' },
      ]) {
        expect(() => repo.save(broken)).toThrow();
      }
      expect(repo.list()).toEqual([]);
    });

    it("Scenario: Recording a зобов'язання moves no number", () => {
      tx().save(debit('t1', '2026-10-02', 250_000, { categoryId: 'work' }), at);
      const read = () =>
        monthlyPicture({ month: '2026-10', accounts: accountsRepo(storage.db).list(), transactions: tx().listAll() });
      const before = read();
      repo.save({ ...internet, id: 'c-rent', name: 'Оренда', amount: 1_500_000, firstDue: '2026-10-10' });
      settle('2026-10-02');
      expect(read()).toEqual(before);
      expect(tx().listAll()).toHaveLength(1);
    });

    it("Scenario: Deleting a зобов'язання leaves its транзакції", () => {
      repo.save(internet);
      tx().save(debit('oct', '2026-10-05', 30_000), at);
      tx().save(debit('nov', '2026-11-05', 30_000, { categoryId: 'work' }), at);
      settle('2026-11-05');
      expect(repo.facts().links).toHaveLength(2);
      const before = [tx().get('oct'), tx().get('nov')];
      repo.remove(internet.id);
      expect([tx().get('oct'), tx().get('nov')]).toEqual(before);
      expect(repo.facts()).toEqual({ links: [], marks: [], refusals: [] });
    });

    it('Scenario: Deleting removes only the plan', () => {
      repo.save(internet);
      tx().save(debit('oct', '2026-10-05', 30_000), at);
      settle('2026-10-05');
      expect(tx().get('oct')).toMatchObject({ categoryId: 'telecom' });
      repo.remove(internet.id);
      expect(repo.list()).toEqual([]);
      expect(tx().get('oct')).toMatchObject({
        date: '2026-10-05',
        accountId: 'black',
        amount: money(30_000, 'UAH'),
        categoryId: 'telecom',
      });
    });

    it('Scenario: Moving the рахунок списання drops links on the old one', () => {
      repo.save(internet);
      tx().save(debit('oct', '2026-10-05', 30_000), at);
      settle('2026-10-05');
      repo.save({ ...internet, debitAccountId: 'white' });
      expect(repo.facts().links).toEqual([]);
    });

    it('Scenario: Moving the дата першого платежу drops a far link', () => {
      repo.save(internet);
      tx().save(debit('oct', '2026-10-05', 30_000), at);
      settle('2026-10-05');
      repo.save({ ...internet, firstDue: '2026-10-20' });
      expect(repo.facts().links).toEqual([]);
    });

    it('Scenario: Changing how often drops what was said about moved платежі', () => {
      const guard: Commitment = { ...internet, id: 'c-guard', name: 'Охорона', firstDue: '2026-10-20' };
      repo.save(guard);
      repo.mark(guard.id, 1, 'paid');
      repo.mark(guard.id, 2, 'skipped');
      repo.save({ ...guard, periodicity: 'quarterly' });
      expect(repo.facts().marks).toEqual([{ commitmentId: guard.id, number: 1, kind: 'paid' }]);
      const dues = commitmentDues(repo.get(guard.id)!, repo.facts(), { until: '2027-01-20', today: '2026-10-21' });
      expect(dues[1]).toMatchObject({ number: 2, due: '2027-01-20', state: 'expected' });
    });

    it("Scenario: Editing a stopped зобов'язання drops what falls after the stop", () => {
      repo.save(netflix);
      repo.mark(netflix.id, 3, 'paid');
      repo.stop(netflix.id, '2026-10-20');
      expect(repo.facts().marks).toHaveLength(1);
      repo.save({ ...repo.get(netflix.id)!, firstDue: '2026-08-22' });
      expect(repo.facts().marks).toEqual([]);
      const stopped = repo.get(netflix.id)!;
      expect(stopped.stoppedOn).toBe('2026-10-20');
      expect(commitmentDues(stopped, repo.facts(), { until: '2027-12-31', today: '2026-10-21' }).map((d) => d.due)).toEqual([
        '2026-08-22',
        '2026-09-22',
      ]);
    });

    it('Scenario: Stopping removes what was said about later платежі', () => {
      repo.save({ ...netflix, firstDue: '2026-10-15' });
      repo.mark(netflix.id, 2, 'skipped');
      repo.stop(netflix.id, '2026-10-20');
      expect(repo.facts().marks).toEqual([]);
      repo.resume(netflix.id);
      const resumed = repo.get(netflix.id)!;
      expect(resumed.stoppedOn).toBeUndefined();
      const dues = commitmentDues(resumed, repo.facts(), { until: '2026-11-15', today: '2026-10-21' });
      expect(dues[1]).toMatchObject({ due: '2026-11-15', state: 'expected' });
    });

    it('Scenario: Stopping before the next платіж', () => {
      repo.save({ ...netflix, firstDue: '2026-09-15' });
      repo.mark(netflix.id, 1, 'paid');
      repo.stop(netflix.id, '2026-10-02');
      const stopped = repo.get(netflix.id)!;
      const dues = commitmentDues(stopped, repo.facts(), { until: firstDueAfter(stopped, '2026-10-02'), today: '2026-10-02' });
      expect(dues.map((d) => [d.due, d.state])).toEqual([['2026-09-15', 'paid']]);
    });
  });

  describe('commitments — links, marks and refusals', () => {
    beforeEach(() => {
      repo.save(netflix);
    });

    it("Scenario: A зобов'язання comes back whole", () => {
      const dir = mkdtempSync(join(tmpdir(), 'cap1tal-commitments-'));
      const file = join(dir, 'db.sqlite');
      try {
        const first = openFileDb(file);
        seed(first.db);
        const r = commitmentsRepo(first.db);
        r.save(netflix);
        transactionsRepo(first.db).save(debit('aug', '2026-08-15', 29_900, { description: 'NETFLIX.COM' }), at);
        transactionsRepo(first.db).save(debit('other', '2026-08-16', 29_900, { description: 'NETFLIX.COM' }), at);
        r.link(netflix.id, 1, 'other');
        r.unlink(netflix.id, 1);
        r.link(netflix.id, 1, 'aug');
        r.mark(netflix.id, 2, 'paid');
        r.mark(netflix.id, 3, 'skipped');
        r.stop(netflix.id, '2026-10-20');
        first.close();

        const second = openFileDb(file);
        const again = commitmentsRepo(second.db);
        expect(again.get(netflix.id)).toEqual({ ...netflix, stoppedOn: '2026-10-20' });
        expect(again.facts()).toEqual({
          links: [{ commitmentId: netflix.id, number: 1, transactionId: 'aug' }],
          marks: [
            { commitmentId: netflix.id, number: 2, kind: 'paid' },
            { commitmentId: netflix.id, number: 3, kind: 'skipped' },
          ],
          refusals: [{ commitmentId: netflix.id, number: 1, transactionId: 'other' }],
        });
        second.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('Scenario: A marked платіж cannot also be linked', () => {
      repo.mark(netflix.id, 3, 'skipped');
      tx().save(debit('oct', '2026-10-15', 29_900, { description: 'Netflix' }), at);
      expect(() => repo.link(netflix.id, 3, 'oct')).toThrowError('пропущеним');
      expect(repo.facts().links).toEqual([]);
      expect(repo.facts().marks).toEqual([{ commitmentId: netflix.id, number: 3, kind: 'skipped' }]);
      // And a linked one cannot be marked.
      tx().save(debit('sep', '2026-09-15', 29_900), at);
      repo.link(netflix.id, 2, 'sep');
      expect(() => repo.mark(netflix.id, 2, 'paid')).toThrowError('списання');
    });

    it('Scenario: Nothing is stored for a платіж after the stop', () => {
      repo.stop(netflix.id, '2026-10-20');
      let thrown: unknown;
      try {
        repo.mark(netflix.id, 4, 'skipped');
      } catch (error) {
        thrown = error;
      }
      expect(isRefusal(thrown)).toBe(true);
      expect(repo.facts().marks).toEqual([]);
      tx().save(debit('nov', '2026-11-15', 29_900), at);
      expect(() => repo.link(netflix.id, 4, 'nov')).toThrow();
      expect(repo.facts().links).toEqual([]);
    });

    it('Scenario: A транзакція links to one платіж at most, whatever the plan', () => {
      const gym: Commitment = { ...internet, id: 'c-gym', name: 'Спортзал', amount: 100_000 };
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
        recordedAt: 1,
      };
      repo.save(gym);
      const installments = installmentsRepo(storage.db);
      installments.save(iphone);
      tx().save(debit('t-iphone', '2026-10-05', 100_000), at);
      tx().save(debit('t-gym', '2026-10-06', 100_000), at);
      installments.link(iphone.id, 5, 't-iphone');
      repo.link(gym.id, 1, 't-gym');

      const pool: Commitment = { ...gym, id: 'c-pool', name: 'Басейн', recordedAt: gym.recordedAt + 1 };
      repo.save(pool);
      expect(() => repo.link(pool.id, 1, 't-iphone')).toThrowError('вже є списанням');
      expect(() => repo.link(pool.id, 1, 't-gym')).toThrowError('вже є списанням');
      const vacuum: Installment = { ...iphone, id: 'i-vacuum', name: 'Пилосос', firstDue: '2026-10-05', paidBefore: 0, recordedAt: 2 };
      installments.save(vacuum);
      expect(() => installments.link(vacuum.id, 1, 't-gym')).toThrowError('вже є списанням');
      expect(installments.facts().links).toEqual([{ installmentId: iphone.id, number: 5, transactionId: 't-iphone' }]);
      expect(repo.facts().links).toEqual([{ commitmentId: gym.id, number: 1, transactionId: 't-gym' }]);
    });

    it('rejects linking a транзакція that is absent, not a витрата, on another рахунок or too far', () => {
      tx().save(debit('white', '2026-10-15', 29_900, { accountId: 'white' }), at);
      tx().save(debit('far', '2026-10-30', 29_900), at);
      tx().save(
        transfer({
          id: 'jar',
          date: '2026-10-15',
          fromAccountId: 'black',
          toAccountId: 'jar',
          left: money(29_900, 'UAH'),
          arrived: money(29_900, 'UAH'),
        }),
        at,
      );
      expect(() => repo.link(netflix.id, 3, 'absent')).toThrow();
      expect(() => repo.link(netflix.id, 3, 'white')).toThrowError('з рахунку списання');
      expect(() => repo.link(netflix.id, 3, 'jar')).toThrowError('з рахунку списання');
      expect(() => repo.link(netflix.id, 3, 'far')).toThrowError('10 днів');
      expect(repo.facts().links).toEqual([]);
    });

    it('Scenario: A removed транзакція releases its link', () => {
      tx().save(debit('oct', '2026-10-15', 29_900), at);
      repo.link(netflix.id, 3, 'oct');
      tx().remove('oct');
      expect(repo.facts().links).toEqual([]);
      expect(repo.get(netflix.id)).toEqual(netflix);
    });

    it('Scenario: A debit of another сума picked by hand', () => {
      repo.save(internet);
      tx().save(debit('odd', '2026-10-12', 32_000, { description: 'Укртелеком' }), at);
      tx().save(debit('kept', '2026-10-13', 40_000, { categoryId: 'work' }), at);
      expect(repo.choices(internet.id, 1).map((c) => c.id)).toEqual(['odd', 'kept']);
      repo.link(internet.id, 1, 'odd');
      expect(repo.facts().links).toContainEqual({ commitmentId: internet.id, number: 1, transactionId: 'odd' });
      expect(tx().get('odd')).toMatchObject({ categoryId: 'telecom' });
      const due = commitmentDues(repo.get(internet.id)!, repo.facts(), { until: '2026-10-31', today: '2026-10-20' })[0];
      expect(due).toMatchObject({ state: 'paid', reason: 'debit', transactionId: 'odd' });
      // Offered no longer.
      expect(repo.choices(internet.id, 1).map((c) => c.id)).toEqual(['kept']);
    });

    it('Scenario: An unlinked debit is not taken back', () => {
      repo.save(internet);
      tx().save(debit('oct', '2026-10-05', 30_000), at);
      settle('2026-10-05');
      expect(repo.facts().links).toContainEqual({ commitmentId: internet.id, number: 1, transactionId: 'oct' });
      repo.unlink(internet.id, 1);
      expect(settle('2026-10-06').commitments).toBe(false);
      expect(repo.facts().links.filter((l) => l.commitmentId === internet.id)).toEqual([]);
      expect(tx().get('oct')).toMatchObject({ categoryId: 'telecom' });
    });

    it('Scenario: Marked as paid without a debit', () => {
      repo.mark(netflix.id, 3, 'paid');
      const read = () =>
        commitmentDues(repo.get(netflix.id)!, repo.facts(), { until: '2026-10-31', today: '2026-10-20' })[2];
      expect(read()).toMatchObject({ state: 'paid', reason: 'marked' });
      repo.unmark(netflix.id, 3);
      expect(read()?.state).toBe('notFound');
    });

    it('rejects a row in another currency written directly only through the repository', () => {
      // The CHECKs keep the shape; the currency against the рахунок is the repository's.
      storage.db
        .insert(commitments)
        .values({
          id: 'raw',
          name: 'raw',
          amountMinor: 1,
          currency: 'USD',
          periodicity: 'monthly',
          firstDue: '2026-10-01',
          debitAccountId: 'black',
          categoryId: null,
          marker: null,
          recordedAt: new Date(1),
          stoppedOn: null,
        })
        .run();
      expect(() => repo.save(repo.get('raw')!)).toThrow();
    });
  });
});
