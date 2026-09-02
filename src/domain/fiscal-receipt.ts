import type { Money } from './money';
import type { IsoDate, Transaction } from './transaction';

/**
 * A фіскальний чек and its позиції чека: the composition of a purchase, kept beneath the
 * транзакція that paid for it.
 *
 * A чек is *not* money. Nothing in `monthly-picture`, `account`, `limits`, `goals` or `reports`
 * reads this file, and nothing here computes a balance, a total spent or a category figure — the
 * only rule the domain owns about a чек is `compareReceiptToTransaction`, which returns a value
 * for a screen to render and decides nothing on its own (design D13).
 *
 * Every amount is an integer in minor units beside its currency code, exactly as everywhere else.
 * A чек is UAH by construction — the tax service registers no other currency — but the amounts
 * carry their code all the same, because an amount without one is not money this app holds.
 */

/**
 * What makes two чеки the same чек: the реєстратор, the чек's own fiscal number and the calendar
 * date it was issued. Not the транзакція it hangs under and not the сума — the same чек offered
 * for a second транзакція is the same чек, which is exactly what has to be refused.
 *
 * The date is part of it because a фіскальний номер чека is unique only within its реєстратор and
 * its day: registrars restart their numbering.
 */
export interface ReceiptIdentity {
  /** `fn` — the фіскальний номер реєстратора. */
  readonly registrarNumber: string;
  /** `id` — the фіскальний номер чека. */
  readonly fiscalNumber: string;
  readonly issuedDate: IsoDate;
}

/** Which of the two dialects the tax service served the document in. */
export type ReceiptDialect = 'prro' | 'rro';

/** A sale or the return of one. A service or shift document is neither and is never a чек. */
export type ReceiptKind = 'sale' | 'return';

/**
 * How a чек came to be on this phone. One value, because there is one way: the owner scanned its
 * QR. No second value is reserved here — the storage CHECK, the бекап parser and this type would
 * each have to be widened for a new one anyway, and a variant nothing produces is a variant that
 * typechecks where storage refuses.
 */
export type ReceiptAcquisition = 'qr_scan';

/**
 * One позиція чека, exactly as the document printed it. Nothing here is derived: `lineTotal` is
 * the registrar's own figure and is never recomputed from quantity × price, because the registrar
 * has already rounded it and a second number would drift from the first.
 *
 * `id` is the позиція's own, stable across reads — it is what a later classification change will
 * reference, and the reason a позиція is not merely an index into an array.
 */
export interface ReceiptItem {
  readonly id: string;
  readonly receiptId: string;
  /** Document order, as the document numbers it: `ROWNUM` for ПРРО, `N` for classic РРО. */
  readonly line: number;
  /** The product name verbatim. Nothing renames, cleans, groups or classifies it. */
  readonly rawName: string;
  /** Quantity × 1000. A document that names no quantity means one, which is 1000. */
  readonly quantityThousandths: number;
  /** «кг», «шт», «л» — as printed, absent when the document names none. */
  readonly unit?: string;
  /** Absent when the document names none; never invented from the line total. */
  readonly unitPrice?: Money;
  /** The document's own figure for this line. */
  readonly lineTotal: Money;
  /** A discount the document stated *for this line*. A чек-level one is not kept (design D2). */
  readonly discount?: Money;
  readonly barcode?: string;
  readonly uktzed?: string;
  /** The seller's internal code for the product. */
  readonly code?: string;
}

/**
 * The чек itself. `snapshot` is the decoded document text, kept immutable so a later parser can
 * re-read it without the tax service (design D7) — no screen reads it, and nothing writes it twice.
 */
export interface FiscalReceipt {
  readonly id: string;
  readonly transactionId: string;
  readonly registrarNumber: string;
  readonly fiscalNumber: string;
  readonly issuedDate: IsoDate;
  /** 'HH:mm:ss', the document's own time of day. */
  readonly issuedTime: string;
  readonly dialect: ReceiptDialect;
  readonly kind: ReceiptKind;
  /** The document's total, never a sum of the позиції: a чек-level discount already moved it. */
  readonly total: Money;
  readonly sellerName?: string;
  readonly pointName?: string;
  readonly acquisition: ReceiptAcquisition;
  /** When the document was fetched, epoch ms. */
  readonly fetchedAt: number;
  readonly snapshot: string;
}

/** The identity of a чек, as the three values that make it one. */
export function receiptIdentity(receipt: {
  registrarNumber: string;
  fiscalNumber: string;
  issuedDate: IsoDate;
}): ReceiptIdentity {
  return {
    registrarNumber: receipt.registrarNumber,
    fiscalNumber: receipt.fiscalNumber,
    issuedDate: receipt.issuedDate,
  };
}

/** Two identities as one string, for the places that need a map key rather than three fields. */
export function identityKey(identity: ReceiptIdentity): string {
  return `${identity.registrarNumber}/${identity.fiscalNumber}/${identity.issuedDate}`;
}

/**
 * What the comparison found. `amounts` is the only part that gates anything — and even it only
 * decides whether the screen asks the owner a second time; nothing here attaches, stores or
 * changes a транзакція.
 *
 * The other three are information the screen shows beside the amounts. They are deliberately not
 * a single «warnings» list: each is a different sentence in the owner's words, and a list would
 * have to be unpacked again at the other end.
 */
export interface ReceiptComparison {
  readonly amounts: 'match' | 'mismatch';
  /** The чек's total and the транзакція's сума, as they were compared — both always named. */
  readonly receiptTotal: Money;
  readonly transactionAmount: Money;
  /** Whole days between the чек's issue date and the транзакція's дата, when they differ. */
  readonly dateDiffersBy?: number;
  /** The seller the чек names, when the транзакція's опис does not already say it. */
  readonly sellerHint?: string;
  /** A return чек on a витрата, or a sale чек on a повернення. Information, never a block. */
  readonly kindDiffers?: true;
}

/** The сума a транзакція of any type puts on one рахунок, or nothing for a переказ. */
function transactionAmount(t: Transaction): Money | undefined {
  return t.type === 'transfer' ? undefined : t.amount;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days between two calendar dates, both read as UTC midnights so no device timezone can
 * move them. Both are `IsoDate`, already validated by whoever built them.
 */
function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
}

/**
 * Whether the транзакція's опис already says what the чек's seller name says. Deliberately crude —
 * a case-insensitive containment either way — because the answer is only ever shown as
 * information, and a cleverer rule would be a classification the vision keeps out of v1.
 */
function opysSaysSeller(description: string | undefined, seller: string): boolean {
  if (description === undefined) return false;
  const opys = description.toLocaleLowerCase('uk');
  const name = seller.toLocaleLowerCase('uk');
  return opys.includes(name) || name.includes(opys);
}

/**
 * The чек's total against the транзакція's сума, ignoring sign — the one rule the domain owns
 * about a чек.
 *
 * The amounts match only when they are the same currency *and* the same absolute figure: no
 * tolerance, and a транзакція in another currency is a mismatch rather than a conversion, because
 * this app never crosses currencies and a чек the owner attaches to a USD витрата is a decision
 * only they can make. A переказ has no single сума and therefore never matches.
 *
 * Everything else the caller passes — the dates, the seller, the kinds — comes back as
 * information. None of it changes `amounts`, and none of it stops an attach: the spec is explicit
 * that a date difference and a return чек on a витрата are things the owner reads, not things the
 * app decides on.
 */
export function compareReceiptToTransaction(input: {
  readonly receipt: Pick<FiscalReceipt, 'total' | 'kind' | 'issuedDate'> & {
    readonly sellerName?: string;
  };
  readonly transaction: Transaction;
}): ReceiptComparison {
  const { receipt, transaction } = input;
  const amount = transactionAmount(transaction);
  // A переказ has two legs in two currencies and no single сума to compare — it is named here
  // rather than left to fall through, so «no сума» reads as a mismatch and not as a match by
  // accident. The screen refuses a переказ the scan offer in the first place; a чек already
  // attached to one that was retyped still gets an honest answer here.
  const compared = amount ?? receipt.total;
  const amounts =
    amount !== undefined &&
    amount.currency === receipt.total.currency &&
    Math.abs(amount.amount) === Math.abs(receipt.total.amount)
      ? 'match'
      : 'mismatch';

  const days = daysBetween(receipt.issuedDate, transaction.date);
  const expectedKind: ReceiptKind = transaction.type === 'refund' ? 'return' : 'sale';
  const description = transaction.description;

  return {
    amounts,
    receiptTotal: receipt.total,
    transactionAmount: compared,
    ...(days === 0 ? {} : { dateDiffersBy: days }),
    ...(receipt.sellerName !== undefined && !opysSaysSeller(description, receipt.sellerName)
      ? { sellerHint: receipt.sellerName }
      : {}),
    // Only a витрата and a повернення carry a kind worth comparing; the чек of a retyped переказ
    // or коригування is not evidence of anything, so nothing is claimed about it.
    ...((transaction.type === 'expense' || transaction.type === 'refund') &&
    receipt.kind !== expectedKind
      ? { kindDiffers: true as const }
      : {}),
  };
}
