import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import type { FiscalReceipt } from '../domain/fiscal-receipt';
import { money } from '../domain/money';
import {
  expenseByDefault,
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  type Income,
  type Transfer,
} from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import {
  absorbIncomeIfAwaited,
  persistRetyped,
  storeTransferPairing,
} from './counterpart-income-repo';
import { receiptsRepo } from './receipts-repo';
import { openTestDb, seedReferences, type TestStorage } from './test-db';
import { transactionsRepo, type TransactionsRepo } from './transactions-repo';

/**
 * The shared pairing step, exercised directly against a real database: `rules-repo.ts` and
 * `monobank-repo.ts` both call these two functions inside their own transaction, and this is
 * where the pure decision (`src/domain/counterpart-income.ts`) meets the candidate query that only
 * storage can run — the ±1 day window, and excluding a дохід the owner sourced or attached a
 * фіскальний чек to.
 */

const VOCABULARY = {
  categories: [UNCATEGORISED_CATEGORY_ID],
  sources: [UNSOURCED_SOURCE_ID, 'gifts'],
} as const;

const platinum = account({ id: 'platinum', name: 'platinum', kind: 'spending', currency: 'UAH' });
const reserve = account({ id: 'reserve', name: 'РЕЗЕРВ', kind: 'savings', currency: 'UAH' });

const roundUp: Transfer = {
  type: 'transfer',
  id: 'tr1',
  date: '2026-09-12',
  fromAccountId: 'platinum',
  toAccountId: 'reserve',
  left: money(616, 'UAH'),
  arrived: money(616, 'UAH'),
};

function unsourcedIncome(input: { id: string; amount: number; date: string }): Income {
  return {
    type: 'income',
    id: input.id,
    date: input.date,
    accountId: 'reserve',
    amount: money(input.amount, 'UAH'),
    sourceId: UNSOURCED_SOURCE_ID,
  };
}

describe('counterpart-income-repo', () => {
  let storage: TestStorage;
  let txs: TransactionsRepo;
  const storedAt = new Date('2026-09-12T09:00:00.000Z');

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    accountsRepo(storage.db).save(platinum);
    accountsRepo(storage.db).save(reserve);
    txs = transactionsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  describe('storeTransferPairing', () => {
    it('Scenario: A retyped переказ absorbs the дохід already stored', () => {
      txs.save(unsourcedIncome({ id: 'i1', amount: 616, date: '2026-09-12' }), storedAt);

      const result = storeTransferPairing(storage.db, roundUp, storedAt);

      expect(result).toEqual({ absorbed: true });
      expect(txs.get('i1')).toBeUndefined();
      const stored = txs.get('tr1');
      expect(stored?.type).toBe('transfer');
      expect(stored && 'awaitingCounterpartIncome' in stored).toBe(false);
    });

    it('Scenario: A переказ with no stored зустрічний дохід awaits it', () => {
      const result = storeTransferPairing(storage.db, roundUp, storedAt);

      expect(result).toEqual({ absorbed: false });
      expect(txs.get('tr1')).toMatchObject({ type: 'transfer', awaitingCounterpartIncome: true });
    });

    it('a дохід the owner gave a джерело is not absorbed', () => {
      txs.save(
        { ...unsourcedIncome({ id: 'i1', amount: 616, date: '2026-09-12' }), sourceId: 'gifts' },
        storedAt,
      );

      const result = storeTransferPairing(storage.db, roundUp, storedAt);

      expect(result).toEqual({ absorbed: false });
      expect(txs.get('i1')).toMatchObject({ sourceId: 'gifts' });
    });

    it('Scenario: A дохід carrying a фіскальний чек is never absorbed', () => {
      txs.save(unsourcedIncome({ id: 'i1', amount: 616, date: '2026-09-12' }), storedAt);
      const receipt: FiscalReceipt = {
        id: 'r1',
        transactionId: 'i1',
        registrarNumber: '4000146829',
        fiscalNumber: '696582',
        issuedDate: '2026-09-12',
        issuedTime: '10:00:00',
        dialect: 'rro',
        kind: 'sale',
        total: money(616, 'UAH'),
        acquisition: 'qr_scan',
        fetchedAt: storedAt.getTime(),
        snapshot: '<RQ/>',
      };
      receiptsRepo(storage.db).attach(receipt, []);

      const result = storeTransferPairing(storage.db, roundUp, storedAt);

      // Absorbing it would delete the row `fiscal_receipts.transaction_id` cascades off of —
      // taking the owner's чек down with the дохід it is attached to.
      expect(result).toEqual({ absorbed: false });
      expect(txs.get('i1')).toBeDefined();
      expect(receiptsRepo(storage.db).forTransaction('i1')).toBeDefined();
    });

    it('a дохід two days away is not absorbed', () => {
      txs.save(unsourcedIncome({ id: 'i1', amount: 616, date: '2026-09-10' }), storedAt);

      const result = storeTransferPairing(storage.db, roundUp, storedAt);

      expect(result).toEqual({ absorbed: false });
      expect(txs.get('i1')).toBeDefined();
    });

    it('an existing awaiting flag on the input transfer is decided here, not trusted', () => {
      txs.save(unsourcedIncome({ id: 'i1', amount: 616, date: '2026-09-12' }), storedAt);

      const result = storeTransferPairing(storage.db, { ...roundUp, awaitingCounterpartIncome: true }, storedAt);

      expect(result).toEqual({ absorbed: true });
      const stored = txs.get('tr1');
      expect(stored && 'awaitingCounterpartIncome' in stored).toBe(false);
    });
  });

  describe('absorbIncomeIfAwaited', () => {
    it('absorbs an awaiting переказ and reports so, clearing its flag', () => {
      txs.save({ ...roundUp, awaitingCounterpartIncome: true }, storedAt);
      const arriving = unsourcedIncome({ id: 'i1', amount: 616, date: '2026-09-12' });

      const absorbed = absorbIncomeIfAwaited(storage.db, arriving, storedAt);

      expect(absorbed).toBe(true);
      expect(txs.get('i1')).toBeUndefined();
      const stored = txs.get('tr1');
      expect(stored?.type).toBe('transfer');
      expect(stored && 'awaitingCounterpartIncome' in stored).toBe(false);
    });

    it('Scenario: An incoming item with no awaiting переказ stays a дохід', () => {
      const arriving = unsourcedIncome({ id: 'i1', amount: 616, date: '2026-09-12' });

      const absorbed = absorbIncomeIfAwaited(storage.db, arriving, storedAt);

      expect(absorbed).toBe(false);
    });

    it('a дохід the owner sourced is never absorbed, even into an awaiting переказ', () => {
      txs.save({ ...roundUp, awaitingCounterpartIncome: true }, storedAt);
      const withSource: Income = {
        ...unsourcedIncome({ id: 'i1', amount: 616, date: '2026-09-12' }),
        sourceId: 'gifts',
      };

      const absorbed = absorbIncomeIfAwaited(storage.db, withSource, storedAt);

      expect(absorbed).toBe(false);
      expect(txs.get('tr1')).toMatchObject({ awaitingCounterpartIncome: true });
    });

    it('Scenario: Two перекази never absorb the same дохід', () => {
      const first: Transfer = { ...roundUp, id: 'tr1', date: '2026-09-10', awaitingCounterpartIncome: true };
      const second: Transfer = { ...roundUp, id: 'tr2', date: '2026-09-11', awaitingCounterpartIncome: true };
      txs.save(first, storedAt);
      txs.save(second, storedAt);
      const arriving = unsourcedIncome({ id: 'i1', amount: 616, date: '2026-09-11' });

      const absorbed = absorbIncomeIfAwaited(storage.db, arriving, storedAt);

      expect(absorbed).toBe(true);
      // The nearer one (tr2, dated 2026-09-11) absorbs it; the other still awaits.
      expect(txs.get('tr2')).not.toHaveProperty('awaitingCounterpartIncome');
      expect(txs.get('tr1')).toMatchObject({ awaitingCounterpartIncome: true });
    });
  });

  describe('persistRetyped', () => {
    it('pairs a переказ and saves a second leg in one call', () => {
      txs.save(unsourcedIncome({ id: 'i1', amount: 616, date: '2026-09-12' }), storedAt);
      const interest: Income = {
        type: 'income',
        id: 'i2',
        date: '2026-09-12',
        accountId: 'reserve',
        amount: money(50, 'UAH'),
        sourceId: 'gifts',
      };

      persistRetyped(
        storage.db,
        [
          { transaction: roundUp, needsPairing: true },
          { transaction: interest, needsPairing: false },
        ],
        storedAt,
      );

      expect(txs.get('i1')).toBeUndefined();
      expect(txs.get('tr1')).toMatchObject({ type: 'transfer' });
      expect(txs.get('i2')).toEqual(interest);
    });

    it('a plain write with needsPairing: false never calls the pairing step', () => {
      txs.save(unsourcedIncome({ id: 'i1', amount: 616, date: '2026-09-12' }), storedAt);

      persistRetyped(storage.db, [{ transaction: roundUp, needsPairing: false }], storedAt);

      // Written as-is, awaiting nothing, and the дохід untouched — needsPairing: false is what
      // `new.tsx` and a settled edit rely on.
      expect(txs.get('tr1')).toMatchObject({ type: 'transfer' });
      expect(txs.get('tr1')).not.toHaveProperty('awaitingCounterpartIncome');
      expect(txs.get('i1')).toBeDefined();
    });

    it('rolls back the whole batch, pairing included, when any write in it fails', () => {
      const rejected = expenseByDefault({
        id: 'bad',
        date: '2026-09-12',
        accountId: 'reserve',
        amount: money(100, 'UAH'),
        // A категорія no row has: the foreign key refuses it, after the переказ in the same batch.
        categoryId: 'no-such-category',
      });

      expect(() =>
        persistRetyped(
          storage.db,
          [
            { transaction: roundUp, needsPairing: true },
            { transaction: rejected, needsPairing: false },
          ],
          storedAt,
        ),
      ).toThrow(/FOREIGN KEY constraint failed/);

      // Nothing from the batch landed — not even the переказ that would otherwise have stored
      // awaiting its зустрічний дохід (none is seeded here, so it never reaches "paired").
      expect(txs.get('tr1')).toBeUndefined();
      expect(txs.get('bad')).toBeUndefined();
    });

    it('Scenario: Retyping back does not restore the absorbed дохід', () => {
      txs.save(unsourcedIncome({ id: 'i1', amount: 616, date: '2026-09-12' }), storedAt);
      persistRetyped(storage.db, [{ transaction: roundUp, needsPairing: true }], storedAt);
      expect(txs.get('i1')).toBeUndefined();

      // Retyped back into a витрата under the same id — a plain write, needing no pairing.
      const backToExpense = expenseByDefault({
        id: 'tr1',
        date: '2026-09-12',
        accountId: 'platinum',
        amount: money(616, 'UAH'),
      });
      persistRetyped(storage.db, [{ transaction: backToExpense, needsPairing: false }], storedAt);

      expect(txs.get('tr1')).toMatchObject({ type: 'expense' });
      // Nothing recreates a deleted row: the absorbed дохід stays gone.
      expect(txs.get('i1')).toBeUndefined();
    });
  });
});
