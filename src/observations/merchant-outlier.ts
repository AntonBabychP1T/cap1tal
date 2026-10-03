import { medianOf } from '../analysis/trends';
import { monthOf, type Expense, type Month } from '../domain/transaction';
import { txRef, type MerchantKeyOf, type MerchantOutlier } from './observation';
import { MERCHANT_LOOKBACK_MONTHS, MERCHANT_MIN_EARLIER, MERCHANT_RATIO } from './thresholds';
import { baselineOf, monthBefore, ratioHalfAway, type Ledger } from './window';

/**
 * A purchase far above what its продавець usually costs (observations, "A purchase far above what
 * its продавець usually costs is stated"): at least three times the median of the продавець's
 * earlier витрати — those dated from the first day of the twelfth calendar month before the
 * purchase's month up to the day before it — when there are at least three of them, and by at
 * least the поріг помітності. Витрати only: a повернення, a дохід, a переказ and a коригування have
 * no продавець to be dear at.
 */
export function merchantOutliers(ledger: Ledger, month: Month, merchantKeyOf: MerchantKeyOf): MerchantOutlier[] {
  let first = month;
  for (let i = 0; i < MERCHANT_LOOKBACK_MONTHS; i += 1) first = monthBefore(first);
  const from = `${first}-01`;
  const reach: Month[] = ledger.months.filter((m) => m >= first && m <= month);

  const found: MerchantOutlier[] = [];
  for (const currency of ledger.currencies) {
    const baseline = baselineOf(ledger, month, currency);
    if (!baseline) continue;
    // Every витрата of the reach in this currency, by продавець.
    const byMerchant = new Map<string, Expense[]>();
    for (const m of reach) {
      for (const t of ledger.inMonth(m)) {
        if (t.type !== 'expense' || t.amount.currency !== currency || t.date < from) continue;
        const merchant = merchantKeyOf(t);
        if (merchant === null) continue;
        const list = byMerchant.get(merchant) ?? [];
        list.push(t);
        byMerchant.set(merchant, list);
      }
    }
    for (const all of byMerchant.values()) {
      for (const x of all) {
        if (monthOf(x.date) !== month) continue;
        // `from` is the first day of the twelfth month before X's own — X is in `month`.
        const earlier = all.filter((e) => e.date < x.date);
        if (earlier.length < MERCHANT_MIN_EARLIER) continue;
        const usual = medianOf(earlier.map((e) => e.amount));
        if (usual.amount <= 0) continue;
        if (x.amount.amount < usual.amount * MERCHANT_RATIO) continue;
        if (x.amount.amount - usual.amount < baseline.noticeable.amount) continue;
        found.push({
          kind: 'merchant-outlier',
          month,
          currency,
          key: `merchant-outlier:${currency}:${x.id}:${month}`,
          transaction: txRef(x),
          usual,
          ratioTenths: Number(ratioHalfAway(BigInt(x.amount.amount) * 10n, BigInt(usual.amount))),
        });
      }
    }
  }
  return found;
}

