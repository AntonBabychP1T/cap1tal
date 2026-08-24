import type { Account, AccountKind } from '../domain/account';

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
