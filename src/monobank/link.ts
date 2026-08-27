import type { Account, AccountKind } from '../domain/account';
import type { MonobankAccount } from './api';

/**
 * What it means for a monobank account to *be* one of the owner's рахунки.
 *
 * A link is one-to-one in both directions: a monobank account feeds exactly one рахунок, and a
 * рахунок is fed by exactly one monobank account. Anything looser and the розрахунковий баланс
 * stops meaning anything — two statements into one рахунок would double every витрата, and one
 * statement into two would put the same money in two places.
 *
 * The owner makes the links; this module only says which ones are valid, and what вид to suggest
 * for a рахунок created to hold one. An unlinked monobank account takes no part in sync at all —
 * it is not skipped quietly, it is simply not linked, and the screen change shows it as such so
 * the decision stays visible.
 */

export interface MonobankLink {
  readonly monobankAccountId: string;
  /** The рахунок this monobank account is. */
  readonly accountId: string;
}

/**
 * The вид a рахунок made for this monobank account starts on: a card is money to spend, a банка is
 * money put aside. A suggestion only — the owner may pick any вид, and `validateLink` does not
 * consult it.
 */
export function suggestKind(monobankAccount: Pick<MonobankAccount, 'kind'>): AccountKind {
  return monobankAccount.kind === 'jar' ? 'savings' : 'spending';
}

/**
 * Refuses a link that would break the one-to-one rule or join two currencies, in the words the
 * screen shows the owner (like `entry-form.ts`'s refusals). A valid link returns nothing.
 *
 * Currencies must be equal, not merely convertible: a link makes the bank's numbers this рахунок's
 * numbers, and there is no rate in this app that could make a USD statement into UAH truth.
 */
export function validateLink(input: {
  readonly monobankAccount: Pick<MonobankAccount, 'id' | 'currency'>;
  readonly account: Pick<Account, 'id' | 'currency'>;
  /** Every link that already exists. A link being *re-*validated is not among them. */
  readonly links: readonly MonobankLink[];
}): void {
  const { monobankAccount, account, links } = input;
  if (monobankAccount.currency !== account.currency) {
    throw new Error(
      `валюти різні: ${monobankAccount.currency} у monobank і ${account.currency} на рахунку`,
    );
  }
  if (links.some((link) => link.monobankAccountId === monobankAccount.id)) {
    throw new Error('цей рахунок monobank уже приєднано');
  }
  if (links.some((link) => link.accountId === account.id)) {
    throw new Error('до цього рахунку вже приєднано рахунок monobank');
  }
}

/**
 * The monobank accounts of the token that no рахунок stands for. What the screen must show, whole:
 * an account left unlinked is the owner's decision, and a decision they were never offered would
 * be a silent gap in «по всіх картках і банках».
 */
export function unlinkedAccounts(
  monobankAccounts: readonly MonobankAccount[],
  links: readonly MonobankLink[],
): MonobankAccount[] {
  const linked = new Set(links.map((link) => link.monobankAccountId));
  return monobankAccounts.filter((a) => !linked.has(a.id));
}
