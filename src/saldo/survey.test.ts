import { describe, expect, it } from 'vitest';

import { FEES_CATEGORY_ID, UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import { parseSaldoExport, type SaldoTransaction } from './parse';
import {
  accountKey,
  flattenName,
  namesToCreate,
  NEW_CATEGORY_PREFIX,
  NEW_SOURCE_PREFIX,
  resolveAccountMap,
  resolveNames,
  reservedCategoryFor,
  survey,
  type Decisions,
  type ExistingState,
} from './survey';
import { csv, leg, pair, type FixtureRow } from './test-fixtures';

const parse = (rows: readonly FixtureRow[]): readonly SaldoTransaction[] => {
  const result = parseSaldoExport(csv(rows));
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.transactions;
};

const existing = (state: Partial<ExistingState>): ExistingState => ({
  accounts: [],
  categories: [],
  sources: [],
  transactions: [],
  ...state,
});

const account = (input: {
  id: string;
  name: string;
  currency?: string;
  kind?: 'spending' | 'savings' | 'investment' | 'cash' | 'debt';
}) => ({
  id: input.id,
  name: input.name,
  kind: input.kind ?? ('spending' as const),
  currency: input.currency ?? 'UAH',
  openingBalance: { amount: 0, currency: input.currency ?? 'UAH' },
  archived: false,
});

describe('survey — the account map', () => {
  it('Scenario: An investment account proposes вид investment', () => {
    const surveyed = survey(
      parse(
        pair({
          id: '1',
          account: 'інжур',
          accountType: 'OTHER_ASSETS',
          journalType: 'DEBIT',
          amount: '100.00',
          other: 'Monobank UAH, Black',
          otherType: 'BANK_ACCOUNTS',
        }),
      ),
    );
    const entry = surveyed.accounts.find((a) => a.saldoAccount === 'інжур');
    expect(entry?.proposedKind).toBe('investment');
    expect(entry?.currency).toBe('UAH');
    expect(entry?.proposedName).toBe('інжур');
  });

  it('proposes вид spending for a bank account and cash for cash', () => {
    const surveyed = survey(
      parse([
        ...pair({
          id: '1',
          account: 'OTP',
          journalType: 'CREDIT',
          amount: '10.00',
          other: 'Groceries',
          otherType: 'EXPENSES',
        }),
        ...pair({
          id: '2',
          account: 'гаманець',
          accountType: 'CASH',
          journalType: 'CREDIT',
          amount: '10.00',
          other: 'Groceries',
          otherType: 'EXPENSES',
        }),
      ]),
    );
    expect(surveyed.accounts.map((a) => [a.saldoAccount, a.proposedKind])).toEqual([
      ['OTP', 'spending'],
      ['гаманець', 'cash'],
    ]);
  });

  it('Scenario: A zero-only pair creates no entry', () => {
    const rows = [
      // Nine USD legs, standing in for the real "валюта моно" — one is enough to prove the pair.
      ...pair({
        id: '1',
        account: 'валюта моно',
        journalType: 'DEBIT',
        amount: '100.00',
        currency: 'USD',
        other: 'Initial balance',
        otherType: 'EQUITY',
      }),
      // …and one zero-amount UAH initial balance, which is not an account the owner has.
      ...pair({
        id: '2',
        account: 'валюта моно',
        journalType: 'DEBIT',
        amount: '0.00',
        currency: 'UAH',
        other: 'Initial balance',
        otherType: 'EQUITY',
      }),
    ];
    const surveyed = survey(parse(rows));
    expect(surveyed.accounts.map((a) => a.key)).toEqual([accountKey('валюта моно', 'USD')]);
    expect(surveyed.droppedPairs.map((p) => p.key)).toEqual([accountKey('валюта моно', 'UAH')]);
    expect(surveyed.droppedPairs[0]?.rows).toHaveLength(1);
  });

  it('keeps a pair whose zero leg is not an initial balance', () => {
    const surveyed = survey(
      parse(
        pair({
          id: '1',
          account: 'сенс',
          journalType: 'CREDIT',
          amount: '0.00',
          other: 'Groceries',
          otherType: 'EXPENSES',
        }),
      ),
    );
    expect(surveyed.accounts.map((a) => a.saldoAccount)).toEqual(['сенс']);
    expect(surveyed.droppedPairs).toEqual([]);
  });

  it('Scenario: Duplicates of one card merge into one рахунок', () => {
    const surveyed = survey(
      parse([
        ...pair({
          id: '1',
          account: 'mono black',
          journalType: 'CREDIT',
          amount: '10.00',
          other: 'Groceries',
          otherType: 'EXPENSES',
        }),
        ...pair({
          id: '2',
          account: 'Monobank UAH, Black',
          journalType: 'CREDIT',
          amount: '20.00',
          other: 'Groceries',
          otherType: 'EXPENSES',
        }),
      ]),
    );
    const decisions: Decisions = {
      accountRedirects: {
        [accountKey('mono black', 'UAH')]: {
          to: 'entry',
          key: accountKey('Monobank UAH, Black', 'UAH'),
        },
      },
    };
    const map = resolveAccountMap(surveyed, decisions);
    expect(map.accounts).toHaveLength(1);
    expect(map.accounts[0]?.name).toBe('Monobank UAH, Black');
    expect(map.byKey.get(accountKey('mono black', 'UAH'))?.id).toBe(
      map.byKey.get(accountKey('Monobank UAH, Black', 'UAH'))?.id,
    );
    expect(map.rejectedRedirects).toEqual([]);
  });

  it('merges onto an existing рахунок and remembers it exists', () => {
    const surveyed = survey(
      parse(
        pair({
          id: '1',
          account: 'mono black',
          journalType: 'CREDIT',
          amount: '10.00',
          other: 'Groceries',
          otherType: 'EXPENSES',
        }),
      ),
    );
    const map = resolveAccountMap(
      surveyed,
      { accountRedirects: { [accountKey('mono black', 'UAH')]: { to: 'account', accountId: 'black' } } },
      existing({ accounts: [account({ id: 'black', name: 'Чорна' })] }),
    );
    expect(map.byKey.get(accountKey('mono black', 'UAH'))).toMatchObject({
      id: 'black',
      existingId: 'black',
      name: 'Чорна',
    });
  });

  it('Scenario: A cross-currency redirect is rejected', () => {
    const surveyed = survey(
      parse(
        pair({
          id: '1',
          account: 'OTP',
          journalType: 'CREDIT',
          amount: '10.00',
          other: 'Groceries',
          otherType: 'EXPENSES',
        }),
      ),
    );
    const map = resolveAccountMap(
      surveyed,
      { accountRedirects: { [accountKey('OTP', 'UAH')]: { to: 'account', accountId: 'dollars' } } },
      existing({ accounts: [account({ id: 'dollars', name: 'Долари', currency: 'USD' })] }),
    );
    // The map is unchanged: the entry keeps its own proposed рахунок in its own currency.
    expect(map.byKey.get(accountKey('OTP', 'UAH'))).toMatchObject({ name: 'OTP', currency: 'UAH' });
    expect(map.byKey.get(accountKey('OTP', 'UAH'))?.existingId).toBeUndefined();
    expect(map.rejectedRedirects[0]?.reason).toContain('USD');
  });

  it('rejects a redirect onto a рахунок that does not exist, and a cycle', () => {
    const surveyed = survey(
      parse([
        ...pair({ id: '1', account: 'A', journalType: 'CREDIT', amount: '1.00', other: 'Groceries', otherType: 'EXPENSES' }),
        ...pair({ id: '2', account: 'B', journalType: 'CREDIT', amount: '1.00', other: 'Groceries', otherType: 'EXPENSES' }),
        ...pair({ id: '3', account: 'C', journalType: 'CREDIT', amount: '1.00', other: 'Groceries', otherType: 'EXPENSES' }),
      ]),
    );
    const map = resolveAccountMap(surveyed, {
      accountRedirects: {
        [accountKey('A', 'UAH')]: { to: 'account', accountId: 'nope' },
        [accountKey('B', 'UAH')]: { to: 'entry', key: accountKey('C', 'UAH') },
        [accountKey('C', 'UAH')]: { to: 'entry', key: accountKey('B', 'UAH') },
      },
    });
    expect(map.rejectedRedirects.map((r) => r.key).sort()).toEqual(
      [accountKey('A', 'UAH'), accountKey('B', 'UAH'), accountKey('C', 'UAH')].sort(),
    );
    expect(map.accounts).toHaveLength(3);
  });

  it('Scenario: The owner sets вид savings on a jar account', () => {
    const surveyed = survey(
      parse(
        pair({
          id: '1',
          account: 'РЕЗЕРВ',
          journalType: 'DEBIT',
          amount: '10.00',
          other: 'Monobank UAH, Black',
          otherType: 'BANK_ACCOUNTS',
        }),
      ),
    );
    const map = resolveAccountMap(surveyed, {
      accountKinds: { [accountKey('РЕЗЕРВ', 'UAH')]: 'savings' },
    });
    // Saldo calls it a bank account; the вид, not the name, is what makes it відкладено.
    expect(surveyed.accounts[0]?.proposedKind).toBe('spending');
    expect(map.byKey.get(accountKey('РЕЗЕРВ', 'UAH'))?.kind).toBe('savings');
  });
});

describe('survey — categories and sources', () => {
  it('Scenario: A flattened income child matches the starter source', () => {
    const surveyed = survey(
      parse(
        pair({
          id: '1',
          account: 'mono black',
          journalType: 'DEBIT',
          amount: '100.00',
          other: 'Андрій',
          otherParent: 'батьки',
          otherType: 'INCOME',
        }),
      ),
      existing({ sources: [{ id: 'batky-andriy', name: 'батьки — Андрій', archived: false }] }),
    );
    expect(surveyed.sources).toEqual([
      {
        saldoName: 'батьки — Андрій',
        matchedId: 'batky-andriy',
        proposedId: `${NEW_SOURCE_PREFIX}батьки — Андрій`,
      },
    ]);
    expect(flattenName('батьки', 'Андрій')).toBe('батьки — Андрій');
  });

  it('Scenario: An unknown category is proposed for creation and can be redirected', () => {
    const surveyed = survey(
      parse(
        pair({
          id: '1',
          account: 'mono black',
          journalType: 'CREDIT',
          amount: '100.00',
          other: 'булка',
          otherType: 'EXPENSES',
        }),
      ),
      existing({ categories: [{ id: 'bakery', name: 'Пекарня', archived: false }] }),
    );
    expect(surveyed.categories).toEqual([
      { saldoName: 'булка', proposedId: `${NEW_CATEGORY_PREFIX}булка` },
    ]);

    const proposed = resolveNames(surveyed.categories, {}, [{ id: 'bakery' }]);
    expect(proposed.get('булка')).toBe(`${NEW_CATEGORY_PREFIX}булка`);
    expect(namesToCreate(surveyed.categories, proposed)).toHaveLength(1);

    const redirected = resolveNames(surveyed.categories, { булка: 'bakery' }, [{ id: 'bakery' }]);
    expect(redirected.get('булка')).toBe('bakery');
    expect(namesToCreate(surveyed.categories, redirected)).toEqual([]);
  });

  it('prefers an unarchived row of the same name, and still matches an archived one', () => {
    const rows = pair({
      id: '1',
      account: 'mono black',
      journalType: 'CREDIT',
      amount: '100.00',
      other: 'Travel',
      otherType: 'EXPENSES',
    });
    expect(
      survey(
        parse(rows),
        existing({
          categories: [
            { id: 'travel-old', name: 'Travel', archived: true },
            { id: 'travel', name: 'Travel', archived: false },
          ],
        }),
      ).categories[0]?.matchedId,
    ).toBe('travel');
    expect(
      survey(
        parse(rows),
        existing({ categories: [{ id: 'travel-old', name: 'Travel', archived: true }] }),
      ).categories[0]?.matchedId,
    ).toBe('travel-old');
  });

  it('Scenario: No category «Борг» and no category "Balance correction" are ever proposed', () => {
    const surveyed = survey(
      parse([
        ...pair({
          id: '1',
          account: 'mono black',
          journalType: 'CREDIT',
          amount: '100.00',
          description: 'борг яріку',
          other: 'Борг',
          otherType: 'EXPENSES',
        }),
        ...pair({
          id: '2',
          account: 'гаманець',
          accountType: 'CASH',
          journalType: 'CREDIT',
          amount: '42.00',
          other: 'Balance correction',
          otherType: 'EXPENSES',
        }),
      ]),
    );
    expect(surveyed.categories).toEqual([]);
    expect(surveyed.debtDescriptions).toEqual([
      { description: 'борг яріку', transactionIds: ['1'] },
    ]);
  });

  it('Scenario: "Uncategorised income" is proposed as an ordinary джерело', () => {
    const surveyed = survey(
      parse(
        pair({
          id: '1',
          account: 'mono black',
          journalType: 'DEBIT',
          amount: '100.00',
          other: 'Uncategorised income',
          otherType: 'INCOME',
        }),
      ),
      existing({ sources: [{ id: 'other-income', name: 'Other income', archived: false }] }),
    );
    // The domain reserves three categories and no джерело, so there is no row to map it onto.
    expect(surveyed.sources).toEqual([
      {
        saldoName: 'Uncategorised income',
        proposedId: `${NEW_SOURCE_PREFIX}Uncategorised income`,
      },
    ]);
    const redirected = resolveNames(surveyed.sources, { 'Uncategorised income': 'other-income' }, [
      { id: 'other-income' },
    ]);
    expect(redirected.get('Uncategorised income')).toBe('other-income');
  });

  it('Scenario: No джерело "Balance correction" is ever proposed', () => {
    const surveyed = survey(
      parse(
        pair({
          id: '1',
          account: 'гаманець',
          accountType: 'CASH',
          journalType: 'DEBIT',
          amount: '42.00',
          other: 'Balance correction',
          otherType: 'INCOME',
        }),
      ),
    );
    expect(surveyed.sources).toEqual([]);
  });

  it('Scenario: Fees map to the reserved row — and never become a proposal', () => {
    const surveyed = survey(
      parse([
        ...pair({
          id: '1',
          account: 'mono black',
          journalType: 'CREDIT',
          amount: '3.02',
          other: 'Fees',
          otherType: 'EXPENSES',
        }),
        ...pair({
          id: '2',
          account: 'mono black',
          journalType: 'CREDIT',
          amount: '5.00',
          other: 'Uncategorised expense',
          otherType: 'EXPENSES',
        }),
      ]),
    );
    expect(surveyed.categories).toEqual([]);
    expect(reservedCategoryFor('Fees')).toBe(FEES_CATEGORY_ID);
    expect(reservedCategoryFor('Uncategorised expense')).toBe(UNCATEGORISED_CATEGORY_ID);
    expect(reservedCategoryFor('Groceries')).toBeUndefined();
  });

  it('collects each distinct «Борг» description once, with every transaction that used it', () => {
    const surveyed = survey(
      parse([
        ...pair({ id: '1', account: 'mono black', journalType: 'CREDIT', amount: '10.00', description: 'борг яріку', other: 'Борг', otherType: 'EXPENSES' }),
        ...pair({ id: '2', account: 'mono black', journalType: 'DEBIT', amount: '10.00', description: 'борг яріку', other: 'Борг', otherType: 'EXPENSES' }),
        ...pair({ id: '3', account: 'mono black', journalType: 'CREDIT', amount: '10.00', description: '', other: 'Борг', otherType: 'EXPENSES' }),
      ]),
    );
    expect(surveyed.debtDescriptions).toEqual([
      { description: 'борг яріку', transactionIds: ['1', '2'] },
      { description: '', transactionIds: ['3'] },
    ]);
  });

  it('surveys the same export into the same survey twice running', () => {
    const rows = [
      ...pair({ id: '1', account: 'mono black', journalType: 'CREDIT', amount: '10.00', other: 'Groceries', otherType: 'EXPENSES' }),
      ...pair({ id: '2', account: 'гаманець', accountType: 'CASH', journalType: 'DEBIT', amount: '10.00', other: 'Salary', otherType: 'INCOME' }),
      leg({ 'Transaction ID': '3', Account: 'сенс', 'Journal Type': 'DEBIT', Amount: '1.00' }),
    ];
    expect(survey(parse(rows))).toEqual(survey(parse(rows)));
  });
});
