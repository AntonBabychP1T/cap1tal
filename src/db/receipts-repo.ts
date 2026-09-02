import { asc, eq } from 'drizzle-orm';

import type { FiscalReceipt, ReceiptIdentity, ReceiptItem } from '../domain/fiscal-receipt';
import { money } from '../domain/money';
import { isoDate } from '../domain/transaction';
import { fiscalReceipts, receiptItems, type FiscalReceiptRow, type ReceiptItemRow } from './schema';
import type { Storage } from './storage';

/**
 * The фіскальні чеки and their позиції: stored as one unit, read back whole, gone with the
 * транзакція they hang under.
 *
 * Nothing here computes money. A чек is detail beneath a транзакція — no balance, no monthly
 * figure, no ліміт and no звіт reads this table, and this repository writes to no other table
 * than its own two. That is what makes «attaching a чек changes no number» something the code
 * says rather than something the tests hope.
 *
 * Two constraints do the work that would otherwise be rules to remember: `transaction_id` is
 * UNIQUE, so a second чек on one транзакція is refused by SQLite; and (registrar, number, date) is
 * UNIQUE, so the same чек cannot be stored twice under two транзакції. Both surface here as the
 * thrown error the caller turns into the owner's sentence.
 */

/** A чек with its позиції, as the app holds it. */
export interface StoredReceipt {
  readonly receipt: FiscalReceipt;
  /** In document order — the order the чек printed them, which is the order they are shown in. */
  readonly items: readonly ReceiptItem[];
}

function toReceipt(row: FiscalReceiptRow): FiscalReceipt {
  return {
    id: row.id,
    transactionId: row.transactionId,
    registrarNumber: row.registrarNumber,
    fiscalNumber: row.fiscalNumber,
    issuedDate: row.issuedDate,
    issuedTime: row.issuedTime,
    dialect: row.dialect === 'rro' ? 'rro' : 'prro',
    kind: row.kind === 'return' ? 'return' : 'sale',
    total: money(row.totalAmount, row.totalCurrency),
    // Absent, never `null`: a чек whose document named no seller and one whose seller was cleared
    // are the same чек, and what is read back has to equal what was written.
    ...(row.sellerName === null ? {} : { sellerName: row.sellerName }),
    ...(row.pointName === null ? {} : { pointName: row.pointName }),
    acquisition: 'qr_scan',
    fetchedAt: row.fetchedAt.getTime(),
    snapshot: row.snapshot,
  };
}

function toItem(row: ReceiptItemRow): ReceiptItem {
  return {
    id: row.id,
    receiptId: row.receiptId,
    line: row.line,
    rawName: row.rawName,
    quantityThousandths: row.quantityThousandths,
    ...(row.unit === null ? {} : { unit: row.unit }),
    ...(row.unitPriceAmount === null || row.unitPriceCurrency === null
      ? {}
      : { unitPrice: money(row.unitPriceAmount, row.unitPriceCurrency) }),
    lineTotal: money(row.lineTotalAmount, row.lineTotalCurrency),
    ...(row.discountAmount === null || row.discountCurrency === null
      ? {}
      : { discount: money(row.discountAmount, row.discountCurrency) }),
    ...(row.barcode === null ? {} : { barcode: row.barcode }),
    ...(row.uktzed === null ? {} : { uktzed: row.uktzed }),
    ...(row.code === null ? {} : { code: row.code }),
  };
}

export function receiptsRepo(db: Storage) {
  const itemsOf = (receiptId: string): ReceiptItem[] =>
    db
      .select()
      .from(receiptItems)
      .where(eq(receiptItems.receiptId, receiptId))
      // By the document's own line number: «позиції are listed as printed» is an ordering, and an
      // ordering that is not asked for is not one SQLite promises.
      .orderBy(asc(receiptItems.line))
      .all()
      .map(toItem);

  return {
    /**
     * One чек with every one of its позиції, or nothing at all.
     *
     * The `db.transaction` is the whole point: a позиція SQLite refuses — a duplicate line, a
     * money pair half-filled — takes the чек down with it, so the owner never ends up with a чек
     * showing three позиції of the nine they can see on the paper.
     *
     * Throws when the транзакція does not exist (the foreign key), when it already carries a чек,
     * or when a чек of this identity is already stored. Each is a sentence the screen says; none
     * is a state this repository is willing to represent.
     */
    attach(receipt: FiscalReceipt, items: readonly ReceiptItem[]): void {
      // Nothing may be stored that the date column would take and the reader could not bring back
      // — the guard every other repository applies, before the transaction opens.
      isoDate(receipt.issuedDate);

      db.transaction((tx) => {
        tx.insert(fiscalReceipts)
          .values({
            id: receipt.id,
            transactionId: receipt.transactionId,
            registrarNumber: receipt.registrarNumber,
            fiscalNumber: receipt.fiscalNumber,
            issuedDate: receipt.issuedDate,
            issuedTime: receipt.issuedTime,
            dialect: receipt.dialect,
            kind: receipt.kind,
            totalAmount: receipt.total.amount,
            totalCurrency: receipt.total.currency,
            sellerName: receipt.sellerName ?? null,
            pointName: receipt.pointName ?? null,
            acquisition: receipt.acquisition,
            fetchedAt: new Date(receipt.fetchedAt),
            snapshot: receipt.snapshot,
          })
          .run();

        for (const item of items) {
          tx.insert(receiptItems)
            .values({
              id: item.id,
              receiptId: receipt.id,
              line: item.line,
              rawName: item.rawName,
              quantityThousandths: item.quantityThousandths,
              unit: item.unit ?? null,
              unitPriceAmount: item.unitPrice?.amount ?? null,
              unitPriceCurrency: item.unitPrice?.currency ?? null,
              lineTotalAmount: item.lineTotal.amount,
              lineTotalCurrency: item.lineTotal.currency,
              discountAmount: item.discount?.amount ?? null,
              discountCurrency: item.discount?.currency ?? null,
              barcode: item.barcode ?? null,
              uktzed: item.uktzed ?? null,
              code: item.code ?? null,
            })
            .run();
        }
      });
    },

    /** The чек of one транзакція, when it carries one. What the транзакція's form reads. */
    forTransaction(transactionId: string): StoredReceipt | undefined {
      const row = db
        .select()
        .from(fiscalReceipts)
        .where(eq(fiscalReceipts.transactionId, transactionId))
        .get();
      return row ? { receipt: toReceipt(row), items: itemsOf(row.id) } : undefined;
    },

    /**
     * The чек of one identity, wherever it is attached — how «this чек is already on another
     * транзакція» is answered before anything is written, in words naming that транзакція.
     */
    byIdentity(identity: ReceiptIdentity): StoredReceipt | undefined {
      const row = db
        .select()
        .from(fiscalReceipts)
        .where(eq(fiscalReceipts.registrarNumber, identity.registrarNumber))
        .all()
        .find(
          (candidate) =>
            candidate.fiscalNumber === identity.fiscalNumber &&
            candidate.issuedDate === identity.issuedDate,
        );
      return row ? { receipt: toReceipt(row), items: itemsOf(row.id) } : undefined;
    },

    /**
     * Detaches a чек: the row goes and its позиції go with it, by the cascade. The транзакція is
     * not touched at all — no сума, no дата, no категорія, no рахунок — which is the whole of what
     * «detaching leaves the транзакція exactly as it was» means.
     */
    remove(receiptId: string): void {
      db.delete(fiscalReceipts).where(eq(fiscalReceipts.id, receiptId)).run();
    },
  };
}

export type ReceiptsRepo = ReturnType<typeof receiptsRepo>;
