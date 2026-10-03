import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { accountsRepo } from '../db/accounts-repo';
import { commitmentsRepo, type CommitmentsRepo } from '../db/commitments-repo';
import { openTestDb, seedReferences, seedReservedCategories, type TestStorage } from '../db/test-db';
import { transactionsRepo } from '../db/transactions-repo';
import { account } from '../domain/account';
import { NO_COMMITMENT_FACTS, type Commitment, type CommitmentFacts } from '../domain/commitments';
import { money } from '../domain/money';
import { expenseByDefault } from '../domain/transaction';
import {
  DUE_VERB_LABELS,
  NO_COMMITMENT_DEBIT_CHOICES,
  UPDATE_AMOUNT,
  commitmentChoiceRows,
  commitmentDetail,
  deleteCommitmentConfirmation,
  shownDues,
  stoppingVerb,
  type LinkedDebit,
} from './commitment-detail';
import { commitmentList } from './commitments-screen';

const NBSP = ' ';

const internet: Commitment = {
  id: 'c-internet',
  name: 'Інтернет',
  amount: 30_000,
  currency: 'UAH',
  periodicity: 'monthly',
  firstDue: '2026-10-05',
  debitAccountId: 'black',
  categoryId: 'telecom',
  recordedAt: 1,
};

const netflix: Commitment = {
  id: 'c-netflix',
  name: 'Netflix',
  amount: 29_900,
  currency: 'UAH',
  periodicity: 'monthly',
  firstDue: '2026-10-15',
  debitAccountId: 'black',
  marker: 'netflix',
  recordedAt: 2,
};

const detailOf = (
  commitment: Commitment,
  facts: CommitmentFacts,
  now: Date,
  debits: ReadonlyMap<string, LinkedDebit> = new Map(),
) => commitmentDetail({ commitment, facts, debits, accountName: 'mono black', now });

describe('commitments-screen — one зобов\'язання', () => {
  it('Scenario: The платежі read newest first', () => {
    const facts: CommitmentFacts = {
      ...NO_COMMITMENT_FACTS,
      links: [{ commitmentId: internet.id, number: 1, transactionId: 't-oct' }],
      marks: [{ commitmentId: internet.id, number: 2, kind: 'paid' }],
    };
    const model = detailOf(internet, facts, new Date(2026, 11, 8, 12), new Map([['t-oct', { date: '2026-10-05', amount: 30_000 }]]));
    expect(model.amount).toBe(`300,00${NBSP}₴ щомісяця`);
    expect(model.dues.map((d) => [d.date, d.amount, d.state, d.debit])).toEqual([
      ['5 січ. 2027', `300,00${NBSP}₴`, 'очікується', undefined],
      ['5 груд.', `300,00${NBSP}₴`, 'очікується', undefined],
      ['5 лист.', `300,00${NBSP}₴`, 'позначено сплаченим', undefined],
      ['5 жовт.', `300,00${NBSP}₴`, 'сплачено', `списання 5 жовт. · 300,00${NBSP}₴`],
    ]);
    expect(model.dues.map((d) => d.verbs)).toEqual([
      ['pick', 'mark', 'skip'],
      ['pick', 'mark', 'skip'],
      ['unmark'],
      ['unlink'],
    ]);
    expect(DUE_VERB_LABELS.unlink).toBe("Відв'язати");
  });

  it('Scenario: Skipping a платіж', () => {
    const skipped: CommitmentFacts = {
      ...NO_COMMITMENT_FACTS,
      marks: [{ commitmentId: netflix.id, number: 1, kind: 'skipped' }],
    };
    const row = detailOf(netflix, skipped, new Date(2026, 9, 15, 12)).dues.find((d) => d.number === 1);
    expect(row).toMatchObject({ state: 'пропущено', verbs: ['unmark'] });
    expect(DUE_VERB_LABELS.skip).toBe('Пропустити');
    expect(DUE_VERB_LABELS.unmark).toBe('Зняти позначку');
  });

  it('Scenario: Stopping moves it under Припинені', () => {
    const now = new Date(2026, 9, 20, 12);
    const stopped: Commitment = { ...netflix, stoppedOn: '2026-10-20' };
    const model = detailOf(stopped, NO_COMMITMENT_FACTS, now);
    expect(stoppingVerb(model.stopped)).toBe('Відновити');
    expect(stoppingVerb(false)).toBe('Припинити');
    expect(model.dues.map((d) => d.date)).toEqual(['15 жовт.']);
    const list = commitmentList([stopped, internet], NO_COMMITMENT_FACTS, now);
    expect(list.active.map((r) => r.name)).toEqual(['Інтернет']);
    expect(list.stopped.map((r) => r.name)).toEqual(['Netflix']);
  });

  it('Scenario: Deleting asks first', () => {
    const asked = deleteCommitmentConfirmation('Інтернет');
    expect(asked.title).toBe('Видалити зобовʼязання «Інтернет»?');
    expect(asked.message).toContain('Транзакції');
    expect(asked.message).toContain('залишаться');
  });

  it('shows no платіж after the first one dated after today', () => {
    const dues = shownDues(internet, NO_COMMITMENT_FACTS, '2026-10-02');
    expect(dues.map((d) => d.due)).toEqual(['2026-10-05']);
  });

  it('Scenario: Netflix got dearer', () => {
    const facts: CommitmentFacts = {
      ...NO_COMMITMENT_FACTS,
      links: [{ commitmentId: netflix.id, number: 1, transactionId: 't-oct' }],
    };
    const model = detailOf(netflix, facts, new Date(2026, 9, 20, 12), new Map([['t-oct', { date: '2026-10-15', amount: 34_900 }]]));
    expect(model.newAmount).toEqual({
      message: `Останнє списання — 349,00${NBSP}₴, а сума зобовʼязання — 299,00${NBSP}₴.`,
      amount: 34_900,
    });
    expect(UPDATE_AMOUNT).toBe('Оновити суму');
  });

  it('Scenario: The same сума offers nothing', () => {
    const facts: CommitmentFacts = {
      ...NO_COMMITMENT_FACTS,
      links: [{ commitmentId: internet.id, number: 1, transactionId: 't-oct' }],
    };
    const model = detailOf(internet, facts, new Date(2026, 9, 20, 12), new Map([['t-oct', { date: '2026-10-05', amount: 30_000 }]]));
    expect(model.newAmount).toBeUndefined();
  });

  it('reads only the latest linked списання for «Оновити суму»', () => {
    const facts: CommitmentFacts = {
      ...NO_COMMITMENT_FACTS,
      links: [
        { commitmentId: internet.id, number: 1, transactionId: 't-oct' },
        { commitmentId: internet.id, number: 2, transactionId: 't-nov' },
      ],
    };
    const debits = new Map([
      ['t-oct', { date: '2026-10-05', amount: 32_000 }],
      ['t-nov', { date: '2026-11-05', amount: 30_000 }],
    ]);
    expect(detailOf(internet, facts, new Date(2026, 10, 20, 12), debits).newAmount).toBeUndefined();
  });
});

describe('commitments-screen — «Обрати списання» and «Оновити суму» in storage', () => {
  let storage: TestStorage;
  let repo: CommitmentsRepo;
  const at = new Date(2026, 9, 1);

  beforeEach(() => {
    storage = openTestDb();
    seedReservedCategories(storage.db);
    seedReferences(storage.db, { categories: ['telecom'] });
    accountsRepo(storage.db).save(account({ id: 'black', name: 'mono black', kind: 'spending', currency: 'UAH' }));
    accountsRepo(storage.db).save(account({ id: 'white', name: 'mono white', kind: 'spending', currency: 'UAH' }));
    repo = commitmentsRepo(storage.db);
    repo.save(internet);
  });
  afterEach(() => storage.close());

  const save = (id: string, date: string, amount: number, accountId = 'black', description?: string) =>
    transactionsRepo(storage.db).save(
      expenseByDefault({ id, date, accountId, amount: money(amount, 'UAH'), ...(description ? { description } : {}) }),
      at,
    );

  it('Scenario: Picking the списання by hand', () => {
    save('near', '2026-10-12', 32_000, 'black', 'Укртелеком');
    save('edge', '2026-10-15', 7_000);
    save('far', '2026-10-16', 32_000);
    save('other-card', '2026-10-05', 32_000, 'white');
    const now = new Date(2026, 9, 13, 12);
    expect(shownDues(internet, repo.facts(), '2026-10-13')[0]?.state).toBe('notFound');

    const rows = commitmentChoiceRows(repo.choices(internet.id, 1), 'UAH', now);
    expect(rows).toEqual([
      { id: 'near', label: `12 жовт. · 320,00${NBSP}₴ · Укртелеком` },
      { id: 'edge', label: `15 жовт. · 70,00${NBSP}₴` },
    ]);
    repo.link(internet.id, 1, rows[0]!.id);
    expect(shownDues(internet, repo.facts(), '2026-10-13')[0]).toMatchObject({ state: 'paid', transactionId: 'near' });
    expect(NO_COMMITMENT_DEBIT_CHOICES).toContain('десять днів');
  });

  it('«Оновити суму» is an ordinary edit with the debited сума', () => {
    save('dear', '2026-10-05', 34_900);
    repo.link(internet.id, 1, 'dear');
    const debits = new Map([['dear', { date: '2026-10-05', amount: 34_900 }]]);
    const offer = commitmentDetail({
      commitment: repo.get(internet.id)!,
      facts: repo.facts(),
      debits,
      accountName: 'mono black',
      now: new Date(2026, 9, 6, 12),
    }).newAmount!;
    repo.save({ ...repo.get(internet.id)!, amount: offer.amount });
    expect(repo.get(internet.id)?.amount).toBe(34_900);
    // The link stands, and nothing is offered any more.
    expect(repo.facts().links).toEqual([{ commitmentId: internet.id, number: 1, transactionId: 'dear' }]);
    expect(
      commitmentDetail({
        commitment: repo.get(internet.id)!,
        facts: repo.facts(),
        debits,
        accountName: 'mono black',
        now: new Date(2026, 9, 6, 12),
      }).newAmount,
    ).toBeUndefined();
  });
});
