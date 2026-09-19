import type { Account } from './account';
import { contribution } from './goals';
import type { CurrentValue } from './investments';
import { money, type CurrencyCode, type Money } from './money';
import type { IsoDate, Transaction } from './transaction';

/**
 * Статок: a derived reading of every recorded рахунок's contribution, never a stored balance of
 * its own. See openspec net-worth capability, decision D3.
 *
 * `Statok is a reading of existing account contributions`, `Archived and debt accounts retain
 * their signed contributions`, `Current valuation states its scope and dates`.
 */

/** One рахунок's signed contribution to Статок, in its own currency. */
export interface AccountContribution {
  readonly accountId: string;
  readonly currency: CurrencyCode;
  readonly amount: Money;
  /**
   * `ledger`: the рахунок's розрахунковий баланс (`computeBalance`). `currentValue`: an
   * інвестиційний рахунок's latest entered поточна вартість, replacing — never adding to —
   * вкладено; `asOf` is set exactly when this is `currentValue`.
   */
  readonly basis: 'ledger' | 'currentValue';
  readonly asOf?: IsoDate;
}

/** One currency's total, or why it has none. */
export type CurrencyTotal =
  | { readonly status: 'known'; readonly amount: Money }
  | { readonly status: 'unavailable'; readonly reason: 'overflow' };

export type NetWorthReading =
  | { readonly status: 'empty' }
  | {
      readonly status: 'ready';
      readonly contributions: readonly AccountContribution[];
      readonly totals: ReadonlyMap<CurrencyCode, CurrencyTotal>;
    };

/**
 * Sums same-currency amounts the way every other exact total in this app does — except that an
 * amount `money()` itself would refuse (unsafe to represent as an integer) becomes `unavailable`
 * rather than a thrown exception or a silently wrong number (design D3, "Overflow… yields an
 * unavailable value, never an unsafe integer").
 */
function sumSafely(currency: CurrencyCode, amounts: readonly number[]): CurrencyTotal {
  const total = amounts.reduce((sum, a) => sum + a, 0);
  try {
    return { status: 'known', amount: money(total, currency) };
  } catch {
    return { status: 'unavailable', reason: 'overflow' };
  }
}

/**
 * The current Статок reading: every recorded рахунок's contribution — archived and debt included,
 * with their sign, an інвестиційний рахунок's latest поточна вартість replacing вкладено when one
 * has been entered — grouped into an exact per-currency total.
 *
 * No accounts at all is `empty`, not a zeroed reading — a рахунок yet to be created is not the
 * same statement as "everything is worth nothing" (net-worth, "Empty and incomplete data are not
 * zero money"). Every account that exists is otherwise represented, whatever its balance: a known
 * zero balance is a genuine reading, not the absence of one.
 *
 * `currentValues` carries a рахунок's own `CurrentValue` only when one was ever entered for it;
 * an інвестиційний рахунок absent from it falls back to вкладено (`contribution`'s own rule) —
 * present with a zero amount is a real observation, not absence (net-worth, "Zero observation is
 * not absence").
 */
export function currentNetWorth(input: {
  readonly accounts: readonly Account[];
  readonly transactions: readonly Transaction[];
  readonly currentValues: ReadonlyMap<string, CurrentValue>;
}): NetWorthReading {
  if (input.accounts.length === 0) {
    return { status: 'empty' };
  }

  const contributions: AccountContribution[] = input.accounts.map((account) => {
    const currentValue = input.currentValues.get(account.id);
    const usesCurrentValue = account.kind === 'investment' && currentValue !== undefined;
    const amount = contribution(account, input.transactions, currentValue?.amount);
    return {
      accountId: account.id,
      currency: account.currency,
      amount,
      basis: usesCurrentValue ? 'currentValue' : 'ledger',
      ...(usesCurrentValue ? { asOf: currentValue.asOf } : {}),
    };
  });

  const byCurrency = new Map<CurrencyCode, number[]>();
  for (const c of contributions) {
    const list = byCurrency.get(c.currency) ?? [];
    list.push(c.amount.amount);
    byCurrency.set(c.currency, list);
  }

  const totals = new Map<CurrencyCode, CurrencyTotal>();
  for (const [currency, amounts] of byCurrency) {
    totals.set(currency, sumSafely(currency, amounts));
  }

  return { status: 'ready', contributions, totals };
}
