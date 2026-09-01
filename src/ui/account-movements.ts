import { computeBalance, reconcile, type Account } from '../domain/account';
import type { Money } from '../domain/money';
import type { Correction, IsoDate, Transaction } from '../domain/transaction';
import { formatMoney, formatSignedMoney, parseActualBalance } from './amount-input';

/**
 * Рухи рахунку — what a рахунок's own screen says: its назва, its розрахунковий баланс, the latest
 * known баланс банку when a link feeds one, and every транзакція touching it, newest first. The
 * screen is the natural place a tap on a рахунок lands, so this module holds everything that tap
 * shows and the screen adds no decision of its own.
 *
 * A reading, never a write: nothing here creates, changes or deletes a транзакція. The balance is
 * the domain's `computeBalance` over exactly the транзакції listed, so what the screen shows and
 * what explains it are the same set.
 */

export interface AccountMovements {
  readonly name: string;
  /** Opening balance plus транзакції, in the рахунок's own currency, as text. */
  readonly balance: string;
  /** The розрахунковий баланс itself, for «Звірити» to compare a typed one against. */
  readonly computed: Money;
  /** The latest known баланс банку, in the same currency; absent unless a link feeds one. */
  readonly bankBalance?: string;
  /** Everything touching the рахунок — a переказ on either leg included — newest first. */
  readonly transactions: readonly Transaction[];
  /** What to say instead of an empty list, or `null` when there is history to show. */
  readonly emptyMessage: string | null;
}

/**
 * Newest first — by date, then by id so the order is total and never depends on the order storage
 * happened to return. The feed's third tie-break, the moment a транзакція was stored, is storage
 * metadata a domain `Transaction` does not carry; the id stands in for it here and the sequence
 * stays stable either way.
 */
function newestFirst(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function accountMovements(input: {
  account: Account;
  /** As `listByAccount` returns them: everything touching the рахунок, on either leg. */
  transactions: readonly Transaction[];
  /** The last known баланс банку of the monobank account a link names, when there is one. */
  bankBalance?: Money;
}): AccountMovements {
  const computed = computeBalance(input.account, input.transactions);
  // A bank figure in another currency than the рахунок is ignored rather than shown, exactly as
  // on Рахунки: amounts of different currencies never combine, and a link is same-currency by
  // construction, so such a value could only come from a link that should not exist.
  const bank =
    input.bankBalance && input.bankBalance.currency === input.account.currency
      ? input.bankBalance
      : undefined;
  const ordered = [...input.transactions].sort(newestFirst);
  return {
    name: input.account.name,
    balance: formatMoney(computed),
    computed,
    ...(bank ? { bankBalance: formatMoney(bank) } : {}),
    transactions: ordered,
    emptyMessage: ordered.length > 0 ? null : 'На цьому рахунку ще нічого не записано.',
  };
}

/**
 * What «Звірити» answers for a typed фактичний залишок: either the коригування the domain built,
 * named in full before anything is written, or the news that the two balances already agree.
 *
 * A refusal is not one of the answers — an entry that is not a сума in the рахунок's currency
 * throws out of `parseActualBalance` in the owner's own words, and the screen reports that the way
 * it reports every other refusal. Nothing partial is ever returned: either there is a коригування
 * to confirm, or there is nothing to create.
 */
export type ReconcileAnswer =
  | {
      readonly kind: 'correction';
      /** Exactly what the domain returned. The screen stores this, never a figure of its own. */
      readonly correction: Correction;
      /** Names the signed difference; the owner reads it before the коригування exists. */
      readonly confirmation: string;
    }
  | { readonly kind: 'agree'; readonly message: string };

/**
 * Звірити any рахунок against what the owner counted. The typed залишок is parsed in the рахунок's
 * own currency, and what is created is the accounts capability's own коригування — `reconcile()`
 * unchanged, including its `undefined` for equal balances, which becomes the "already agree"
 * answer instead of a silent nothing.
 */
export function reconcileTyped(input: {
  account: Account;
  /** The розрахунковий баланс as `accountMovements` computed it. */
  computed: Money;
  typed: string;
  date: IsoDate;
  newId: () => string;
}): ReconcileAnswer {
  const actual = parseActualBalance(input.typed, input.account.currency);
  const correction = reconcile({
    accountId: input.account.id,
    computed: input.computed,
    actual,
    date: input.date,
    newId: input.newId,
  });
  if (!correction) {
    return {
      kind: 'agree',
      message: `Розрахунковий баланс «${input.account.name}» уже дорівнює ${formatMoney(actual)} — коригувати нічого.`,
    };
  }
  return {
    kind: 'correction',
    correction,
    confirmation:
      `Створити коригування на ${formatSignedMoney(correction.amount)} для «${input.account.name}»? ` +
      `Розрахунковий баланс (${formatMoney(input.computed)}) зрівняється з фактичним залишком ` +
      `(${formatMoney(actual)}); жодне число не перезаписується без транзакції.`,
  };
}
