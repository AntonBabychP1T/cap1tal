import { activeAccounts, type Account } from '../domain/account';
import type { Transaction } from '../domain/transaction';

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
  const offered = activeAccounts(all);
  if (currentAccountId === undefined) {
    return offered;
  }
  const current = all.find((a) => a.id === currentAccountId);
  return current && current.archived ? [...offered, current] : offered;
}

/** The account each leg of a stored transaction sits on; `undefined` where it has no such leg. */
export function legsOf(t: Transaction): { source?: string; destination?: string } {
  return t.type === 'transfer'
    ? { source: t.fromAccountId, destination: t.toAccountId }
    : { source: t.accountId };
}
