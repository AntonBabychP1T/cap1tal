import type { Account, AccountKind } from '../domain/account';
import { gainLoss, type CurrentValue } from '../domain/investments';
import { money, subtract, type Money } from '../domain/money';
import type { IsoDate } from '../domain/transaction';
import { formatMoney, formatSignedMoney } from './amount-input';

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
  /** Set for a рахунок of вид `investment` and for no other — the three numbers of §10. */
  readonly investment?: InvestmentNumbers;
}

/**
 * What an інвестиційний рахунок's row says beyond its balance, and the words that keep the numbers
 * apart. `computed` above **is** the вкладено — the розрахунковий баланс of such a рахунок is what
 * went in minus what came back out — so it is named here rather than repeated as a second amount.
 *
 * The вартість, its дата and the прибуток arrive together or not at all: without a вартість there
 * is no прибуток, and «worth exactly what went in» (a прибуток of zero) is a different answer from
 * «we do not know what it is worth» (no block at all).
 */
export interface InvestmentNumbers {
  /** The name the row's main amount carries here. */
  readonly contributedLabel: string;
  /** The поточна вартість with the дата it describes and the прибуток / збиток between the two. */
  readonly value?: {
    readonly amount: string;
    readonly asOf: IsoDate;
    /** Signed, always: «+60 000,00 UAH» and «−50 000,00 UAH» read differently from «60 000,00». */
    readonly gainLoss: string;
    /** «прибуток» or «збиток» — zero is a прибуток of nothing, not a збиток. */
    readonly gainLossLabel: string;
  };
  /** What the row offers: recording the first вартість, or replacing the one it shows. */
  readonly recordLabel: string;
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
  currentValues: ReadonlyMap<string, CurrentValue> = new Map(),
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
      ...(a.kind === 'investment'
        ? { investment: investmentNumbers(a, own, currentValues.get(a.id)) }
        : {}),
    };
  });
}

/**
 * The block one інвестиційний рахунок's row carries. An archived one keeps it: archiving hides a
 * рахунок from the pickers, it does not un-invest the money or forget what the owner said it is
 * worth.
 *
 * A вартість in another currency than the рахунок is dropped rather than shown, the way a foreign
 * баланс банку is above: `gainLoss` would refuse to subtract across currencies, and the only writer
 * refuses to store such a вартість, so one arriving here could only come from a row that should not
 * exist.
 */
function investmentNumbers(
  account: Account,
  contributed: Money,
  value: CurrentValue | undefined,
): InvestmentNumbers {
  const own = value && value.amount.currency === account.currency ? value : undefined;
  const difference = gainLoss(own?.amount, contributed);
  return {
    contributedLabel: 'вкладено',
    ...(own && difference
      ? {
          value: {
            amount: formatMoney(own.amount),
            asOf: own.asOf,
            gainLoss: formatSignedMoney(difference),
            gainLossLabel: difference.amount < 0 ? 'збиток' : 'прибуток',
          },
        }
      : {}),
    recordLabel: own ? 'Змінити вартість' : 'Записати вартість',
  };
}

/**
 * What clearing a поточна вартість is confirmed with. Unlike «Звірити» below, nothing is written
 * and no транзакція is created — which is exactly why the sentence says so: the owner is giving up
 * the app's only record of what this інвестиція is worth, and none of their money moves with it.
 */
export function clearValueConfirmation(row: AccountRow): string {
  return `Забрати поточну вартість «${row.account.name}» (${row.investment?.value?.amount})? Залишиться саме вкладено (${row.computed}); жодна транзакція не створюється і жоден баланс не змінюється.`;
}

/**
 * What «Звірити» is confirmed with: the exact signed difference, named before anything is
 * written. A коригування is a транзакція like any other — it moves the month's numbers — so the
 * owner sees the amount before it exists, not after.
 */
export function reconcileConfirmation(row: AccountRow): string {
  return `Створити коригування на ${row.difference} для «${row.account.name}»? Розрахунковий баланс (${row.computed}) зрівняється з балансом банку (${row.bankBalance}); жодне число не перезаписується без транзакції.`;
}
