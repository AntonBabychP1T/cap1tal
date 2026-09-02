import type { Account, AccountKind } from '../domain/account';
import { money, type CurrencyCode, type Money } from '../domain/money';
import type { MonobankRate } from '../monobank/currency';
import { byCurrency, formatMinorUnitsGrouped, formatMoney } from './amount-input';
import { approximateUah } from './approx-uah';

/**
 * «Скільки всього грошей» — the money held, as the accounts capability defines it: the sum of the
 * розрахунковий баланс of every unarchived рахунок, totalled separately per currency, and the same
 * sums per вид so money in hand stays separable from money that is saved, invested or lent.
 *
 * A reading of balances, never a monthly number. Nothing here is stored: the screen already
 * computed the balances it shows, and this is one pass over them. An archived рахунок counts
 * toward nothing — it is out of use, and its balance is history. A negative balance is counted
 * with its sign: the total says what the рахунки hold, not what the owner wishes they held.
 */

export interface AccountTotals {
  /** Only the виды that have an unarchived рахунок; the archived group is absent by construction. */
  readonly perKind: ReadonlyMap<AccountKind, readonly Money[]>;
  /** Across every unarchived рахунок, UAH first then alphabetically. Empty when there are none. */
  readonly total: readonly Money[];
}

/** Sums into a per-currency map, so two currencies stay two numbers and never become one. */
function addInto(sums: Map<CurrencyCode, number>, amount: Money): void {
  sums.set(amount.currency, (sums.get(amount.currency) ?? 0) + amount.amount);
}

function ordered(sums: ReadonlyMap<CurrencyCode, number>): Money[] {
  return [...sums.keys()]
    .sort(byCurrency)
    .map((currency) => money(sums.get(currency)!, currency));
}

/**
 * `computed` is the map the Рахунки screen already builds — рахунок id → розрахунковий баланс.
 * A рахунок missing from it counts as zero in its own currency rather than being dropped: it is
 * still a рахунок, and a half-loaded map must not quietly shrink the answer.
 */
export function accountTotals(
  accounts: readonly Account[],
  computed: ReadonlyMap<string, Money>,
): AccountTotals {
  const byKind = new Map<AccountKind, Map<CurrencyCode, number>>();
  const grand = new Map<CurrencyCode, number>();

  for (const a of accounts) {
    if (a.archived) {
      continue;
    }
    const balance = computed.get(a.id) ?? money(0, a.currency);
    let sums = byKind.get(a.kind);
    if (!sums) {
      sums = new Map();
      byKind.set(a.kind, sums);
    }
    addInto(sums, balance);
    addInto(grand, balance);
  }

  const perKind = new Map<AccountKind, readonly Money[]>();
  for (const [kind, sums] of byKind) {
    perKind.set(kind, ordered(sums));
  }
  return { perKind, total: ordered(grand) };
}

const UAH: CurrencyCode = 'UAH';

/**
 * The secondary «≈ … грн» beside the totals, by exactly the honesty rule the monthly picture
 * already lives under (`approximatePicture`): a UAH-only total has nothing to approximate, and one
 * unknown rate withholds the whole figure rather than producing a sum of part of the money wearing
 * the total's name. Display only — nothing here is stored, and no balance derives from it.
 *
 * The mark is inside the string so no caller can drop it and show the approximation as a total.
 */
export function approximateTotals(
  totals: readonly Money[],
  rates: readonly MonobankRate[],
): string | null {
  if (!totals.some((m) => m.currency !== UAH)) {
    return null;
  }
  const rateFor = new Map(rates.map((rate) => [rate.currency, rate.rateMillionths]));
  let sum = 0;
  for (const m of totals) {
    if (m.currency === UAH) {
      sum += m.amount;
    } else {
      const rateMillionths = rateFor.get(m.currency);
      if (rateMillionths === undefined) {
        return null;
      }
      sum += approximateUah(m.amount, rateMillionths);
    }
    if (!Number.isSafeInteger(sum)) {
      // Past the safe-integer range there is no honest number left, and this figure is the one
      // thing beside the totals that is allowed to be absent.
      return null;
    }
  }
  return `≈ ${formatMinorUnitsGrouped(sum)} грн`;
}

/**
 * A per-currency total as one line: «7 050,00 UAH · 200,00 USD». The separator is here and not in
 * the screen so the two currencies read as two amounts rather than running together — the one
 * thing the accounts capability forbids is showing them as a single combined number. Nothing held
 * is an empty string, which the screens use to show no total at all.
 */
export function totalsLine(totals: readonly Money[]): string {
  return totals.map(formatMoney).join(' · ');
}
