import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault, UNCATEGORISED_CATEGORY_ID, type Expense } from '../domain/transaction';
import { observationsOf } from '../observations/observations';
import { accountsRepo } from './accounts-repo';
import { duplicateAnswersRepo } from './duplicate-answers-repo';
import { openFileDb, openTestDb, seedReferences, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

const VOCABULARY = { categories: [UNCATEGORISED_CATEGORY_ID, 'coffee'], sources: [] } as const;
const black = account({ id: 'black', name: 'mono black', kind: 'spending', currency: 'UAH' });
const storedAt = new Date('2026-10-04T08:00:00.000Z');
const answeredAt = new Date('2026-10-04T10:15:00.000Z');

function coffee(id: string, date: string, description?: string): Expense {
  return expenseByDefault({
    id,
    date,
    accountId: 'black',
    amount: money(12500, 'UAH'),
    categoryId: 'coffee',
    ...(description ? { description } : {}),
  });
}

function seed(storage: TestStorage): void {
  seedReferences(storage.db, VOCABULARY);
  accountsRepo(storage.db).save(black);
  const transactions = transactionsRepo(storage.db);
  transactions.save(coffee('a', '2026-10-03', 'Aroma Kava'), storedAt);
  transactions.save(coffee('b', '2026-10-04'), storedAt);
  transactions.save(coffee('c', '2026-10-04'), storedAt);
}

describe('duplicate-answers-repo', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seed(storage);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: Answering twice keeps one answer', () => {
    const answers = duplicateAnswersRepo(storage.db);
    answers.answer('a', 'b', answeredAt);
    answers.answer('b', 'a', new Date('2026-10-05T09:00:00.000Z'));

    expect(answers.list()).toEqual([{ first: 'a', second: 'b', answeredAt }]);
  });

  it('Scenario: Editing keeps the answer', () => {
    const answers = duplicateAnswersRepo(storage.db);
    answers.answer('b', 'a', answeredAt);

    // Replaced through the one write path every edit takes, with a new опис.
    transactionsRepo(storage.db).save(coffee('a', '2026-10-03', 'Aroma Kava Подол'), storedAt);

    expect(answers.answered('a', 'b')).toEqual(answeredAt);
  });

  it('Scenario: Deleting takes the answer with it', () => {
    const answers = duplicateAnswersRepo(storage.db);
    answers.answer('a', 'b', answeredAt);
    answers.answer('a', 'c', answeredAt);

    transactionsRepo(storage.db).remove('b');

    expect(answers.list()).toEqual([{ first: 'a', second: 'c', answeredAt }]);
    expect(answers.answered('a', 'b')).toBeUndefined();
    expect(transactionsRepo(storage.db).get('a')).toEqual(coffee('a', '2026-10-03', 'Aroma Kava'));
  });

  it('Scenario: Deleting the дубль ends the question', () => {
    const answers = duplicateAnswersRepo(storage.db);
    const transactions = transactionsRepo(storage.db);
    const stated = () =>
      observationsOf({
        month: '2026-10',
        today: '2026-10-10',
        transactions: transactions.listAll(),
        categories: [],
        answers: answers.list(),
      }).flatMap((o) => (o.kind === 'possible-duplicate' ? [`${o.first.id}+${o.second.id}`] : []));
    answers.answer('a', 'b', answeredAt);
    expect(stated()).toEqual(['b+c', 'a+c']);

    // The owner opens `b` from the спостереження and deletes it, as any транзакція is deleted.
    transactions.remove('b');

    // The cascade took its answer, the detector has no pair naming it, and nothing else moved.
    expect(answers.list()).toEqual([]);
    expect(stated()).toEqual(['a+c']);
    expect(transactions.get('a')).toEqual(coffee('a', '2026-10-03', 'Aroma Kava'));
    expect(transactions.get('c')).toEqual(coffee('c', '2026-10-04'));
  });

  it('A транзакція is not answered as a дубль of itself', () => {
    const answers = duplicateAnswersRepo(storage.db);
    expect(() => answers.answer('a', 'a', answeredAt)).toThrow();
    expect(answers.list()).toEqual([]);
  });
});

describe('duplicate-answers-repo across a restart', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cap1tal-duplicate-answers-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('Scenario: An answer round-trips', () => {
    const file = join(dir, 'cap1tal.db');
    const first = openFileDb(file);
    seed(first);
    duplicateAnswersRepo(first.db).answer('a', 'b', answeredAt);
    first.close();

    // A fresh repository over the same file — the app started again.
    const second = openFileDb(file);
    const answers = duplicateAnswersRepo(second.db);
    expect(answers.answered('a', 'b')).toEqual(answeredAt);
    expect(answers.answered('b', 'a')).toEqual(answeredAt);
    expect(answers.answered('a', 'c')).toBeUndefined();
    second.close();
  });
});
