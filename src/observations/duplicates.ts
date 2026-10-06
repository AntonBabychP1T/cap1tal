import { foldMerchant } from '../analysis/details';
import { daysBetween } from '../domain/dates';
import { FEES_CATEGORY_ID, type Expense, type Month } from '../domain/transaction';
import { monthAfter, monthEnd } from '../progress/summary';
import { pairKey, txRef, type PossibleDuplicate } from './observation';
import { DUPLICATE_DAY_SPAN } from './thresholds';
import { monthBefore, type Ledger } from './window';

/**
 * Two records whose описи fold to the same text are likely two records the bank itself sent —
 * two purchases, not one written twice — when either carries an MCC or their рахунок is linked to
 * monobank (the MCC is stored only on records imported since it was added, so older monobank
 * records carry none). Equal описи without a bank behind them are most often one витрата written
 * twice by hand, and are asked about.
 */
function sameBankText(a: Expense, b: Expense, linkedAccountIds: ReadonlySet<string>): boolean {
  return (
    a.description !== undefined &&
    b.description !== undefined &&
    foldMerchant(a.description) === foldMerchant(b.description) &&
    (a.mcc !== undefined || b.mcc !== undefined || linkedAccountIds.has(a.accountId))
  );
}

/**
 * Every можливий дубль touching `month` (observations, "Two витрати that may be one purchase
 * recorded twice are a можливий дубль"): two витрати on one рахунок with the same сума, dated at
 * most a day apart, at least one of them in the month, that are not two equal bank texts, not a
 * «Комісія», and not answered «Не дубль». `linkedAccountIds` are the рахунки linked to monobank.
 *
 * A stored транзакція does not say which door it came through, so the detector asks rather than
 * guesses: two bank records at two продавці a day apart are stated too, and «Не дубль» answers
 * them. No поріг and no window — a дубль makes the record wrong whatever its size.
 */
export function possibleDuplicates(
  ledger: Ledger,
  month: Month,
  answered: ReadonlySet<string>,
  linkedAccountIds: ReadonlySet<string>,
): PossibleDuplicate[] {
  // The month itself and one day either side of it: a pair needs one half inside the month.
  const first = `${month}-01`;
  const last = monthEnd(month);
  const candidates: Expense[] = [];
  for (const m of [monthBefore(month), month, monthAfter(month)]) {
    for (const t of ledger.inMonth(m)) {
      if (t.type !== 'expense' || t.categoryId === FEES_CATEGORY_ID) continue;
      const near =
        t.date < first
          ? daysBetween(t.date, first) <= DUPLICATE_DAY_SPAN
          : t.date > last
            ? daysBetween(t.date, last) <= DUPLICATE_DAY_SPAN
            : true;
      if (near) candidates.push(t);
    }
  }

  const groups = new Map<string, Expense[]>();
  for (const t of candidates) {
    const key = `${t.accountId}\u0000${t.amount.currency}\u0000${t.amount.amount}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const found: PossibleDuplicate[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const x = group[i]!;
        const y = group[j]!;
        if (daysBetween(x.date, y.date) > DUPLICATE_DAY_SPAN) break;
        if (!x.date.startsWith(`${month}-`) && !y.date.startsWith(`${month}-`)) continue;
        if (sameBankText(x, y, linkedAccountIds) || answered.has(pairKey(x.id, y.id))) continue;
        found.push({
          kind: 'possible-duplicate',
          month,
          currency: x.amount.currency,
          key: `possible-duplicate:${x.amount.currency}:${x.id}+${y.id}:${month}`,
          amount: x.amount,
          accountId: x.accountId,
          first: txRef(x),
          second: txRef(y),
        });
      }
    }
  }
  return found;
}

