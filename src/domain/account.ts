import { money, type CurrencyCode, type Money } from './money';

/**
 * The kind — never the name — decides how a transfer touching the account is
 * classified in the monthly picture.
 */
export type AccountKind = 'spending' | 'savings' | 'investment' | 'cash' | 'debt';

export interface Account {
  readonly id: string;
  readonly name: string;
  readonly kind: AccountKind;
  readonly currency: CurrencyCode;
}

/** The monthly numbers a transfer can move. Spent is never one of them. */
export type TransferBucket = 'saved' | 'invested' | 'lent';

const BUCKET_BY_KIND: Partial<Record<AccountKind, TransferBucket>> = {
  savings: 'saved',
  investment: 'invested',
  debt: 'lent',
};

export interface TransferContribution {
  readonly bucket: TransferBucket;
  /** Positive adds to the bucket, negative subtracts from it. */
  readonly amount: Money;
}

/**
 * How a transfer counts in the monthly picture. A savings/investment/debt
 * destination adds to its bucket, a savings/investment/debt source subtracts;
 * spending and cash ends contribute nothing. Cross-currency contributions are
 * measured by the opposite leg (in that leg's currency), same-currency ones by
 * the classified account's own leg, so a shortfall is accounted for exactly by
 * its proposed fee expense.
 */
export function classifyTransfer(input: {
  from: Account;
  to: Account;
  left: Money;
  arrived: Money;
}): TransferContribution[] {
  const { from, to, left, arrived } = input;
  const crossCurrency = left.currency !== arrived.currency;
  const contributions: TransferContribution[] = [];

  const toBucket = BUCKET_BY_KIND[to.kind];
  if (toBucket) {
    const measured = crossCurrency ? left : arrived;
    contributions.push({ bucket: toBucket, amount: measured });
  }

  const fromBucket = BUCKET_BY_KIND[from.kind];
  if (fromBucket) {
    const measured = crossCurrency ? arrived : left;
    contributions.push({
      bucket: fromBucket,
      amount: money(-measured.amount, measured.currency),
    });
  }

  return contributions;
}
