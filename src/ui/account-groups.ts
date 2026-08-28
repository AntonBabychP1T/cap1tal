import type { Account, AccountKind } from '../domain/account';
import { money, subtract, type Money } from '../domain/money';
import { formatMoney } from './amount-input';

/**
 * The Рахунки sections as pure data, so the screen only renders them. Archived accounts never
 * appear under their вид — they collect in a single "Архів" group at the end, keeping their
 * history and balance but out of the way of the accounts still in use.
 */

/** The вид order the screen shows, most-used first. Не алфавіт: this order is a decision. */
const KIND_ORDER: readonly AccountKind[] = [
  'spending',
  'savings',
  'investment',
  'cash',
  'debt',
];

export interface AccountGroup {
  /** An account kind, or `archived` for the one group that is not a вид. */
  readonly kind: AccountKind | 'archived';
  readonly accounts: readonly Account[];
}

/**
 * Groups accounts for the screen: a group per вид in the fixed order above holding the
 * unarchived accounts of that kind, then a final `archived` group. Groups with nothing in them
 * are left out entirely — an owner with no debts sees no "Борги" heading, and an owner with
 * nothing at all sees no groups, which is what invites creating the first рахунок. The order
 * inside a group is the order given (the repository lists by name).
 */
export function groupAccountsByKind(accounts: readonly Account[]): AccountGroup[] {
  const groups: AccountGroup[] = [];
  for (const kind of KIND_ORDER) {
    const ofKind = accounts.filter((a) => !a.archived && a.kind === kind);
    if (ofKind.length > 0) {
      groups.push({ kind, accounts: ofKind });
    }
  }
  const archived = accounts.filter((a) => a.archived);
  if (archived.length > 0) {
    groups.push({ kind: 'archived', accounts: archived });
  }
  return groups;
}

/**
 * One рахунок's row on «Рахунки»: its own розрахунковий баланс, and — when a monobank account
 * feeds it — the latest баланс банку beside it.
 *
 * The bank's figure is not on the domain `Account` and deliberately never will be. A рахунок's
 * balance is opening balance plus транзакції, computed and explainable; what the bank last said
 * is a cached observation of something outside the app. Keeping them two fields on a view model
 * is what lets the screen show both, in the same currency, without either one pretending to be
 * the other.
 */
export interface AccountRow {
  readonly account: Account;
  /** Opening balance plus транзакції, in the рахунок's own currency. */
  readonly computed: string;
  /** The latest known баланс банку, in the same currency; absent unless a link feeds it. */
  readonly bankBalance?: string;
  /** Whether «Звірити» is worth offering: there is a bank figure and it differs. */
  readonly reconcilable: boolean;
  /** The signed difference «Звірити» would record, when there is one to record. */
  readonly difference?: string;
}

/**
 * The rows of one group. `bankBalances` is keyed by рахунок id — the join `monobank-repo`'s
 * `linkForAccount` makes — and a рахунок no link feeds simply has no entry, which is most of them.
 *
 * A bank figure in another currency than the рахунок is ignored rather than shown: amounts of
 * different currencies never combine, and a link is same-currency by construction, so such a
 * value could only come from a link that should not exist.
 */
export function accountRows(
  accounts: readonly Account[],
  computed: ReadonlyMap<string, Money>,
  bankBalances: ReadonlyMap<string, Money> = new Map(),
): AccountRow[] {
  return accounts.map((a) => {
    const own = computed.get(a.id) ?? money(0, a.currency);
    const bank = bankBalances.get(a.id);
    const comparable = bank && bank.currency === a.currency ? bank : undefined;
    const difference = comparable ? subtract(comparable, own) : undefined;
    return {
      account: a,
      computed: formatMoney(own),
      ...(comparable ? { bankBalance: formatMoney(comparable) } : {}),
      reconcilable: difference !== undefined && difference.amount !== 0,
      ...(difference && difference.amount !== 0 ? { difference: formatMoney(difference) } : {}),
    };
  });
}

/**
 * What «Звірити» is confirmed with: the exact signed difference, named before anything is
 * written. A коригування is a транзакція like any other — it moves the month's numbers — so the
 * owner sees the amount before it exists, not after.
 */
export function reconcileConfirmation(row: AccountRow): string {
  return `Створити коригування на ${row.difference} для «${row.account.name}»? Розрахунковий баланс (${row.computed}) зрівняється з балансом банку (${row.bankBalance}); жодне число не перезаписується без транзакції.`;
}
