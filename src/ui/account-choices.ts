import { activeAccounts, type Account } from '../domain/account';
import type { Transaction } from '../domain/transaction';
import { byName } from './labels';

/**
 * What one account picker on the editing screen offers. An archived account is offered for
 * nothing new — not as the рахунок of a витрата, and not as the destination of a переказ it is
 * being retyped into — yet the transaction it already sits on keeps showing it, so opening that
 * transaction never silently moves it off.
 *
 * Hence one list per leg rather than one list for the screen: the leg that already holds an
 * archived account keeps it; the other leg never sees it.
 */
export function accountChoicesFor(
  all: readonly Account[],
  currentAccountId: string | undefined,
): Account[] {
  // In Ukrainian order, like the категорії and джерела beside it on the same form. Storage sorts
  // by name in SQLite's BINARY collation, which files every Cyrillic назва after every Latin one —
  // so a picker that passed that order through showed «Борги» below «binance» while the категорія
  // picker two fields down had «Без категорії» at the top. One form, two alphabets. The order also
  // decides what the short list is topped up from, so it is what the owner reads on a fresh phone.
  //
  // Sorted before `withCurrent` and not after: the carried row is appended deliberately, and
  // ordering the offers may not swallow it into the middle of them.
  return withCurrent([...activeAccounts(all)].sort(byName), all, currentAccountId);
}

/**
 * The row a stored transaction already sits on, appended when the offered list does not hold it.
 * The rule above, stated once for every picker that has it — accounts here, категорії and джерела
 * in `category-choices.ts`. It goes last rather than into its place in the order because it is
 * not an offer; it is what is already there.
 */
export function withCurrent<Row extends { readonly id: string }>(
  offered: Row[],
  all: readonly Row[],
  currentId: string | undefined,
): Row[] {
  if (currentId === undefined || offered.some((row) => row.id === currentId)) {
    return offered;
  }
  const current = all.find((row) => row.id === currentId);
  return current ? [...offered, current] : offered;
}

/** The account each leg of a stored transaction sits on; `undefined` where it has no such leg. */
export function legsOf(t: Transaction): { source?: string; destination?: string } {
  return t.type === 'transfer'
    ? { source: t.fromAccountId, destination: t.toAccountId }
    : { source: t.accountId };
}
