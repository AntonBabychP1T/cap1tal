import type { Account } from '../domain/account';
import { monthlyPicture } from '../domain/monthly-picture';
import { type CurrencyCode, type Money } from '../domain/money';
import type { Month, Transaction } from '../domain/transaction';
import type { MonobankRate } from '../monobank/currency';
import { accountTotals, approximateTotals, totalsLine } from './account-totals';
import { byCurrency } from './amount-input';
import { transactionCount } from './labels';
import { emptyMessageFor, NO_INCOME_NOTE } from './month-screen';
import { monthInLabel } from './months';

/**
 * Everything Головний says, as strings — so what the screen the app opens on reads is under
 * `verify` even though the screen itself is JSX. The screen maps over this and adds no decisions
 * of its own.
 *
 * Nothing here computes money. The month's numbers are `monthlyPicture`'s, the total is
 * `accountTotals`', the approximation is `approximateTotals`'; this module chooses which of them
 * Головний shows, in which order, and in what words. See design.md §D5.
 */

/** The glossary's words, as the two headings the status carries. */
const LEFT_LABEL = 'Залишилось';
const SPENT_LABEL = 'Витрачено';

export interface HomeMonthStatus {
  /** «Залишилось у вересні» — the figure's name and the month it is about, in one line. */
  readonly title: string;
  /**
   * The month's залишилось, per currency, joined by `totalsLine` — the same joiner the money held
   * uses, so the two lines cannot drift apart in how they refuse to become one figure: «60315,00
   * UAH · −70,00 USD». Empty exactly when `emptyMessage` is not null.
   */
  readonly left: string;
  /** «Витрачено», so the screen does not spell the glossary word itself. */
  readonly spentLabel: string;
  /** The month's витрачено, per currency, joined the same way. */
  readonly spent: string;
  /**
   * Why залишилось may be negative: no дохід is recorded in some currency of the month yet. The
   * sentence Місяць uses, naming the currencies when the month holds more than one. `null` when
   * every currency of the month has дохід above zero.
   */
  readonly note: string | null;
  /** What to say instead of the numbers when there are none; `null` when there are. */
  readonly emptyMessage: string | null;
}

export interface HomeHeld {
  /** «329 748,00 UAH · 700,00 USD» — per currency, never combined. */
  readonly line: string;
  /** The «≈ … грн» beside it, or `null` when there is nothing honest to show. */
  readonly approximate: string | null;
}

export interface HomeAttention {
  /**
   * The counted rows the section names — today only «Без категорії». The pending чернетки are the
   * screen's own block below them: they are answered in place, not counted.
   */
  readonly rows: readonly string[];
  /** Whether the section exists at all. False means no heading and no space held for one. */
  readonly present: boolean;
}

export interface HomeViewModel {
  readonly month: Month;
  readonly status: HomeMonthStatus;
  /** `null` when no unarchived рахунок exists — the screen says so instead. */
  readonly held: HomeHeld | null;
  readonly attention: HomeAttention;
}

/**
 * Which currencies of the month have no дохід to set their витрати against. Per currency, because
 * Місяць decides it per currency: a month with UAH дохід and USD-only витрати is honestly two
 * situations, and the negative one has to carry its reason where it is shown.
 */
function noteFor(currencies: readonly CurrencyCode[], without: readonly CurrencyCode[]): string | null {
  if (without.length === 0) {
    return null;
  }
  if (currencies.length === 1) {
    return NO_INCOME_NOTE;
  }
  return `У цьому місяці ще не записано дохід у ${without.join(' і ')}.`;
}

export function homeViewModel(input: {
  month: Month;
  /** Every account, archived included: classifying a transfer needs its вид (design decision 8). */
  accounts: readonly Account[];
  /** The транзакції of `month`, as the screen loaded them. */
  transactions: readonly Transaction[];
  /** The розрахунковий баланс per account id — the same map Рахунки builds. */
  balances: ReadonlyMap<string, Money>;
  rates: readonly MonobankRate[];
  /** How many stored витрати carry «Без категорії», counted over everything stored. */
  uncategorised: number;
  /** How many чернетки await an answer. Counted for nothing but whether the section exists. */
  pendingDrafts: number;
}): HomeViewModel {
  const picture = monthlyPicture({
    month: input.month,
    accounts: input.accounts,
    transactions: input.transactions,
  });
  const currencies = [...picture.keys()].sort(byCurrency);
  const numbers = currencies.map((currency) => picture.get(currency)!);

  const totals = accountTotals(input.accounts, input.balances);

  const rows: string[] = [];
  if (input.uncategorised > 0) {
    rows.push(`${transactionCount(input.uncategorised)} без категорії`);
  }

  return {
    month: input.month,
    status: {
      title: `${LEFT_LABEL} ${monthInLabel(input.month)}`,
      left: totalsLine(numbers.map((n) => n.left)),
      spentLabel: SPENT_LABEL,
      spent: totalsLine(numbers.map((n) => n.spent)),
      note: noteFor(
        currencies,
        currencies.filter((currency) => picture.get(currency)!.income.amount <= 0),
      ),
      emptyMessage: emptyMessageFor(currencies.length, input.transactions.length > 0),
    },
    held:
      totals.total.length > 0
        ? {
            line: totalsLine(totals.total),
            approximate: approximateTotals(totals.total, input.rates),
          }
        : null,
    attention: { rows, present: rows.length > 0 || input.pendingDrafts > 0 },
  };
}
