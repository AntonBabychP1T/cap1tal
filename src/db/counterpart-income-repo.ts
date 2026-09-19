import { and, eq, gte, isNull, lte } from 'drizzle-orm';

import { pickAwaitingTransfer, pickCounterpartIncome, type Dated } from '../domain/counterpart-income';
import {
  UNSOURCED_SOURCE_ID,
  type IsoDate,
  type Income,
  type Transaction,
  type Transfer,
} from '../domain/transaction';
import { toTransaction } from './mappers';
import { counterpartIncomeAwaits, fiscalReceipts, transactions } from './schema';
import type { Storage } from './storage';
import { transactionsRepo } from './transactions-repo';

/**
 * The shared step every write path that can pair a переказ with its зустрічний дохід goes
 * through: sync's commit, the розбір and a retype (design D5). Functions over a transaction
 * handle, not a repository object of their own — each is called inside the caller's own database
 * transaction and never opens one.
 */

/** A calendar date shifted by whole days, still `YYYY-MM-DD`, no timezone involved. */
function shiftDate(date: IsoDate, deltaDays: number): IsoDate {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + deltaDays);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Stored доходи «Без джерела» on `accountId` within one calendar day of `date`, excluding any the
 * owner attached a фіскальний чек to — the candidate query, not the domain rule (`isCounterpartIncome`
 * still decides the exact match; this only narrows what reaches it).
 */
function candidateIncomes(db: Storage, accountId: string, date: IsoDate): Dated<Income>[] {
  return db
    .select()
    .from(transactions)
    .leftJoin(fiscalReceipts, eq(fiscalReceipts.transactionId, transactions.id))
    .where(
      and(
        eq(transactions.type, 'income'),
        eq(transactions.accountId, accountId),
        eq(transactions.sourceId, UNSOURCED_SOURCE_ID),
        gte(transactions.date, shiftDate(date, -1)),
        lte(transactions.date, shiftDate(date, 1)),
        isNull(fiscalReceipts.id),
      ),
    )
    .all()
    .map((row) => ({
      transaction: toTransaction(row.transactions) as Income,
      storedAt: row.transactions.createdAt,
    }));
}

/** Stored перекази onto `accountId`, still awaiting, within one calendar day of `date`. */
function candidateAwaitingTransfers(db: Storage, accountId: string, date: IsoDate): Dated<Transfer>[] {
  return db
    .select()
    .from(transactions)
    .innerJoin(counterpartIncomeAwaits, eq(counterpartIncomeAwaits.transactionId, transactions.id))
    .where(
      and(
        eq(transactions.type, 'transfer'),
        eq(transactions.toAccountId, accountId),
        gte(transactions.date, shiftDate(date, -1)),
        lte(transactions.date, shiftDate(date, 1)),
      ),
    )
    .all()
    .map((row) => ({
      transaction: toTransaction(row.transactions, true) as Transfer,
      storedAt: row.transactions.createdAt,
    }));
}

/** Whether storing `transfer` absorbed a already-stored зустрічний дохід, or left it awaiting one. */
export interface PairingResult {
  readonly absorbed: boolean;
}

/**
 * Stores a переказ a правило-переказ or a retype just decided: absorbs its зустрічний дохід when
 * one is already stored — removing that дохід in the same write — or stores it awaiting one
 * otherwise (transactions, "A переказ absorbs its зустрічний дохід"). Any awaiting flag on the
 * input `transfer` itself is decided here, not trusted from the caller.
 */
export function storeTransferPairing(db: Storage, transfer: Transfer, storedAt: Date): PairingResult {
  const candidates = candidateIncomes(db, transfer.toAccountId, transfer.date);
  const picked = pickCounterpartIncome(transfer, candidates);
  const write = transactionsRepo(db);
  if (picked !== undefined) {
    write.remove(picked.id);
    const { awaitingCounterpartIncome: _awaiting, ...settled } = transfer;
    write.save(settled, storedAt);
    return { absorbed: true };
  }
  write.save({ ...transfer, awaitingCounterpartIncome: true }, storedAt);
  return { absorbed: false };
}

/**
 * An incoming дохід «Без джерела»: absorbed into the nearest awaiting переказ onto its рахунок
 * when one exists — clearing that переказ's flag and reporting so the caller stores no дохід for
 * it — or left for the caller to store as it is when none does (monobank-sync, "A statement answer
 * pairs a переказ with its зустрічний дохід in one commit").
 */
export function absorbIncomeIfAwaited(db: Storage, income: Income, now: Date): boolean {
  if (income.sourceId !== UNSOURCED_SOURCE_ID) return false;
  const awaiting = candidateAwaitingTransfers(db, income.accountId, income.date);
  const picked = pickAwaitingTransfer(income, awaiting);
  if (picked === undefined) return false;
  const { awaitingCounterpartIncome: _awaiting, ...settled } = picked;
  transactionsRepo(db).save(settled, now);
  return true;
}

/**
 * A retype or edit's whole write, atomically: every транзакція `[id].tsx` writes for one save —
 * the переказ (or whatever it retyped from), and an optional second leg such as a «Комісія»
 * витрата or a «Відсотки» дохід — lands in one database transaction or none of it does, exactly
 * as `rulesRepo.save`'s розбір and `commitStatementAnswer` already write theirs (design D5).
 * `needsPairing` is the caller's own `transferWriteNeedsPairing` decision (`src/ui/retype.ts`) —
 * taken as data rather than importing `src/ui/`, which would cross a layer `src/db/` never does.
 */
export function persistRetyped(
  db: Storage,
  written: readonly { readonly transaction: Transaction; readonly needsPairing: boolean }[],
  storedAt: Date,
): void {
  db.transaction((tx) => {
    const write = transactionsRepo(tx);
    written.forEach(({ transaction, needsPairing }, index) => {
      const at = new Date(storedAt.getTime() + index);
      if (needsPairing && transaction.type === 'transfer') {
        storeTransferPairing(tx, transaction, at);
      } else {
        write.save(transaction, at);
      }
    });
  }, { behavior: 'immediate' });
}
