import type { StoredRate } from '../db/rates-repo';
import type { Account } from '../domain/account';
import type { CurrentValue } from '../domain/investments';
import type { MovementKind } from '../domain/net-worth';
import { monthOf, type IsoDate, type Transaction } from '../domain/transaction';
import type { NetWorthInput } from './net-worth';

/**
 * Test support for `net-worth.test.ts` and `net-worth-screen.test.ts`: the readings
 * `src/db/net-worth-repo.ts` would return, computed straight from domain транзакції the way its
 * `MOVEMENTS` fragment does — so a UI test states its ledger, not four hand-summed tables. The
 * repository's own differential test is what proves the SQL agrees with this shape.
 */

interface Leg {
  readonly accountId: string;
  readonly date: IsoDate;
  readonly effect: number;
  readonly kind: MovementKind;
}

function legsOf(t: Transaction): Leg[] {
  switch (t.type) {
    case 'transfer':
      return [
        { accountId: t.fromAccountId, date: t.date, effect: -t.left.amount, kind: 'transfer' },
        { accountId: t.toAccountId, date: t.date, effect: t.arrived.amount, kind: 'transfer' },
      ];
    case 'expense':
      return [{ accountId: t.accountId, date: t.date, effect: -t.amount.amount, kind: 'spending' }];
    case 'refund':
      return [{ accountId: t.accountId, date: t.date, effect: t.amount.amount, kind: 'spending' }];
    case 'income':
      return [{ accountId: t.accountId, date: t.date, effect: t.amount.amount, kind: 'income' }];
    case 'correction':
      return [{ accountId: t.accountId, date: t.date, effect: t.amount.amount, kind: 'correction' }];
  }
}

export function netWorthInputFrom(input: {
  readonly accounts: readonly Account[];
  readonly transactions?: readonly Transaction[];
  readonly today: IsoDate;
  readonly now?: Date;
  readonly rates?: readonly StoredRate[];
  readonly requestedHistory?: string;
  readonly currentValues?: ReadonlyMap<string, CurrentValue>;
}): NetWorthInput {
  const transactions = input.transactions ?? [];
  const legs = transactions.flatMap(legsOf).filter((leg) => leg.date <= input.today);
  const sum = new Map<string, number>();
  const byKind = new Map<string, number>();
  const first = new Map<string, IsoDate>();
  for (const leg of legs) {
    const key = `${leg.accountId}|${monthOf(leg.date)}`;
    sum.set(key, (sum.get(key) ?? 0) + leg.effect);
    const kindKey = `${key}|${leg.kind}`;
    byKind.set(kindKey, (byKind.get(kindKey) ?? 0) + leg.effect);
    const seen = first.get(leg.accountId);
    if (seen === undefined || leg.date < seen) first.set(leg.accountId, leg.date);
  }
  return {
    accounts: input.accounts,
    transactions,
    currentValues: input.currentValues ?? new Map(),
    monthlyMovement: [...sum].map(([key, net]) => {
      const [accountId, month] = key.split('|') as [string, string];
      return { accountId, month, net };
    }),
    monthlyMovementByType: [...byKind].map(([key, net]) => {
      const [accountId, month, kind] = key.split('|') as [string, string, MovementKind];
      return { accountId, month, kind, net };
    }),
    firstDates: [...first].map(([accountId, firstDate]) => ({ accountId, firstDate })),
    firstDateMovement: [...first].map(([accountId, firstDate]) => ({
      accountId,
      net: legs
        .filter((leg) => leg.accountId === accountId && leg.date <= firstDate)
        .reduce((total, leg) => total + leg.effect, 0),
    })),
    rates: input.rates ?? [],
    accountsWithFutureRecords: new Set(
      transactions.flatMap(legsOf).filter((leg) => leg.date > input.today).map((leg) => leg.accountId),
    ),
    ...(input.requestedHistory !== undefined ? { requestedHistory: input.requestedHistory } : {}),
    now: input.now ?? new Date(`${input.today}T12:00:00`),
    today: input.today,
  };
}
