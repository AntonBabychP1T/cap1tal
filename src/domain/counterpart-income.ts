import { daysBetween } from './dates';
import { UNSOURCED_SOURCE_ID, type IsoDate, type Income, type Transfer } from './transaction';

/**
 * Which stored дохід is the **зустрічний дохід** (glossary) of a переказ, and the reverse question
 * for an arriving дохід — the one pure decision every write path that can pair a переказ with its
 * counterpart goes through, so sync's commit, the розбір and a retype can never disagree about
 * what a зустрічний дохід is (design D3).
 *
 * Nothing here reads storage: the candidates are handed in, already loaded and already filtered to
 * exclude a дохід the owner gave a джерело and one carrying a фіскальний чек — a query only
 * storage can run (design D5).
 */

/**
 * Whether `income` is the зустрічний дохід of `transfer`: sits on the переказ's destination
 * рахунок, carries the reserved джерело «Без джерела», is of exactly the переказ's arrived сума in
 * the same currency, and is dated no more than one calendar day before or after the переказ.
 *
 * Compared against `transfer.arrived`, never `transfer.left`: the destination is where the дохід
 * sits, so this holds for a cross-currency переказ exactly as it does for a same-currency one — a
 * дохід of the arrived сума is what the destination's own statement would report either way.
 */
export function isCounterpartIncome(transfer: Transfer, income: Income): boolean {
  return (
    income.accountId === transfer.toAccountId &&
    income.sourceId === UNSOURCED_SOURCE_ID &&
    income.amount.currency === transfer.arrived.currency &&
    income.amount.amount === transfer.arrived.amount &&
    daysBetween(income.date, transfer.date) <= 1
  );
}

/** A candidate with the storage metadata the tie-break needs — the feed's own `storedAt`. */
export interface Dated<T> {
  readonly transaction: T;
  readonly storedAt: Date;
}

/**
 * Among several qualifying candidates, the one nearest the anchor date wins; a tie goes to whichever
 * was stored earliest, and a further tie to the smaller id — so the outcome never depends on load
 * order (design D3).
 */
function nearest<T extends { readonly id: string; readonly date: IsoDate }>(
  anchor: IsoDate,
  candidates: readonly Dated<T>[],
): T | undefined {
  let best: Dated<T> | undefined;
  for (const candidate of candidates) {
    if (best === undefined || beats(anchor, candidate, best)) best = candidate;
  }
  return best?.transaction;
}

function beats<T extends { readonly id: string; readonly date: IsoDate }>(
  anchor: IsoDate,
  candidate: Dated<T>,
  best: Dated<T>,
): boolean {
  const byDistance =
    daysBetween(anchor, candidate.transaction.date) - daysBetween(anchor, best.transaction.date);
  if (byDistance !== 0) return byDistance < 0;
  const byStoredAt = candidate.storedAt.getTime() - best.storedAt.getTime();
  if (byStoredAt !== 0) return byStoredAt < 0;
  return candidate.transaction.id < best.transaction.id;
}

/**
 * The зустрічний дохід to absorb into `transfer`, among stored доходи that already qualify as
 * candidates — a переказ SHALL absorb at most one, so the caller passes only доходи not yet
 * absorbed by another (transactions, "A переказ absorbs its зустрічний дохід").
 */
export function pickCounterpartIncome(
  transfer: Transfer,
  incomes: readonly Dated<Income>[],
): Income | undefined {
  return nearest(
    transfer.date,
    incomes.filter((candidate) => isCounterpartIncome(transfer, candidate.transaction)),
  );
}

/** The mirror choice: which awaiting переказ an arriving дохід settles, by the same ordering. */
export function pickAwaitingTransfer(
  income: Income,
  awaiting: readonly Dated<Transfer>[],
): Transfer | undefined {
  return nearest(
    income.date,
    awaiting.filter((candidate) => isCounterpartIncome(candidate.transaction, income)),
  );
}
