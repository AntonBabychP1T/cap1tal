import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { accountsRepo } from '../db/accounts-repo';
import { installmentsRepo, type InstallmentsRepo } from '../db/installments-repo';
import { openTestDb, seedReferences, seedReservedCategories, type TestStorage } from '../db/test-db';
import { transactionsRepo } from '../db/transactions-repo';
import { account } from '../domain/account';
import { installmentPartStates, NO_INSTALLMENT_FACTS, type Installment } from '../domain/installments';
import { money } from '../domain/money';
import { expenseByDefault } from '../domain/transaction';
import {
  closingVerb,
  debitChoiceRows,
  deleteInstallmentConfirmation,
  installmentDetail,
} from './installment-detail';

const NBSP = ' ';
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

describe('one розстрочка', () => {
  it('Scenario: The графік reads month by month', () => {
    const detail = installmentDetail({
      installment: iphone,
      facts: { ...NO_INSTALLMENT_FACTS, links: [{ installmentId: iphone.id, number: 5, transactionId: 't5' }] },
      debits: new Map([['t5', { date: '2026-10-05', amount: 100_000 }]]),
      accountName: 'mono black',
      categoryName: 'Техніка',
      now: new Date(2026, 9, 10, 12),
    });
    expect(detail.parts.slice(0, 4).map((p) => p.state)).toEqual(Array(4).fill('сплачено раніше'));
    expect(detail.parts[4]).toMatchObject({
      title: 'Платіж 5',
      state: 'сплачено',
      debit: `списання 5 жовт. · 1${NBSP}000,00${NBSP}₴`,
      verbs: ['unlink'],
    });
    expect(detail.parts.slice(5).map((p) => p.state)).toEqual(Array(5).fill('очікується'));
    expect(detail.parts[5]).toMatchObject({ scheduled: `5 лист. · 1${NBSP}000,00${NBSP}₴`, verbs: ['pick', 'mark'] });
    expect(detail).toMatchObject({
      name: 'iPhone',
      progress: '5 з 10',
      remaining: `Залишок 5${NBSP}000,00${NBSP}₴`,
      part: `1${NBSP}000,00${NBSP}₴ на місяць`,
      account: 'mono black',
      category: 'Техніка',
      closed: false,
    });
    expect(closingVerb(detail.closed)).toBe('Закрити достроково');
  });

  it('offers «Зняти позначку» on a marked платіж and nothing on a закрито one', () => {
    const detail = installmentDetail({
      installment: { ...iphone, closedOn: '2026-10-10' },
      facts: { ...NO_INSTALLMENT_FACTS, marks: [{ installmentId: iphone.id, number: 5 }] },
      debits: new Map(),
      accountName: 'mono black',
      now: new Date(2026, 9, 10, 12),
    });
    expect(detail.parts[4]).toMatchObject({ state: 'позначено сплаченим', verbs: ['unmark'] });
    expect(detail.parts[5]).toMatchObject({ state: 'закрито', verbs: [] });
    expect(closingVerb(detail.closed)).toBe('Відновити');
  });

  it('Scenario: Deleting asks first', () => {
    const asked = deleteInstallmentConfirmation('iPhone');
    expect(asked.title).toBe('Видалити розстрочку «iPhone»?');
    expect(asked.message).toContain('транзакції');
    expect(asked.message).toContain('залишаться');
  });
});

describe('«Обрати списання»', () => {
  let storage: TestStorage;
  let repo: InstallmentsRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReservedCategories(storage.db);
    seedReferences(storage.db, { categories: ['tech'] });
    accountsRepo(storage.db).save(account({ id: 'black', name: 'mono black', kind: 'spending', currency: 'UAH' }));
    accountsRepo(storage.db).save(account({ id: 'white', name: 'mono white', kind: 'spending', currency: 'UAH' }));
    repo = installmentsRepo(storage.db);
    repo.save(iphone);
  });
  afterEach(() => storage.close());

  it('Scenario: Picking the списання by hand', () => {
    const at = new Date(2026, 9, 1);
    const save = (id: string, date: string, amount: number, accountId = 'black', description?: string) =>
      transactionsRepo(storage.db).save(
        expenseByDefault({ id, date, accountId, amount: money(amount, 'UAH'), ...(description ? { description } : {}) }),
        at,
      );
    save('near', '2026-10-06', 100_050, 'black', 'MONO ЧАСТИНАМИ');
    save('edge', '2026-10-15', 7_000);
    save('far', '2026-10-16', 100_050);
    save('other-card', '2026-10-05', 100_050, 'white');
    const today = new Date(2026, 9, 9, 12);
    expect(installmentPartStates(iphone, repo.facts(), '2026-10-09').parts[4]?.state).toBe('notFound');

    const rows = debitChoiceRows(repo.choices(iphone.id, 5), today);
    expect(rows).toEqual([
      { id: 'near', label: `6 жовт. · 1${NBSP}000,50${NBSP}₴ · MONO ЧАСТИНАМИ` },
      { id: 'edge', label: `15 жовт. · 70,00${NBSP}₴` },
    ]);

    repo.link(iphone.id, 5, rows[0]!.id);
    expect(installmentPartStates(iphone, repo.facts(), '2026-10-09').parts[4]).toMatchObject({
      state: 'paid',
      transactionId: 'near',
    });
    // Linked now, so no longer a choice for the next платіж.
    expect(repo.choices(iphone.id, 6).map((c) => c.id)).not.toContain('near');
  });
});
