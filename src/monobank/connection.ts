import type { MonobankTokenStore } from '../platform/monobank-token';
import { fetchClientInfo, type AuthFetchLike, type MonobankAccount, type Outcome } from './api';

/**
 * Whether this device is connected to monobank, and everything that changes that: submitting a
 * token, replacing one, removing one, and refreshing the cached list of accounts.
 *
 * Every step is staged, and the order is the whole design (D6). A candidate is validated against
 * client-info *first*; only an `ok` answer reaches secure storage; only a successful secure write
 * is followed by caching the accounts it returned. A rejection, a rate limit or an outage at any
 * point therefore leaves the previous connection exactly as it was — a typo or a bad minute can
 * cost the owner a retry, never a working token or a single row of their history.
 *
 * The token appears in no result of any function here. It goes into the `X-Token` header inside
 * `api.ts` and nowhere else: not into an outcome, not into an error message, not into a log. The
 * tests assert that by searching every answer for the value they handed in.
 */

export interface ConnectionPorts {
  /** Where the secret lives; `src/platform/monobank-token.ts` is the port it implements. */
  readonly tokenStore: MonobankTokenStore;
  readonly fetch: AuthFetchLike;
  /**
   * Where a successful client-info answer is cached, so the screen has something to show while
   * offline. Called only after the token is safely kept, and never for a failed answer.
   */
  readonly cacheAccounts: (accounts: readonly MonobankAccount[], obtainedAt: Date) => void;
  /** The clock, injected as everywhere else — the moment the balances were obtained. */
  readonly now: () => Date;
}

/**
 * What a connection attempt answers with. The three API failures are the API's own, so the screen
 * can say "re-enter the token", "wait" or "try later" rather than one shrug for all three;
 * `storage-unavailable` is the fourth, and it is separate because it means the token is fine and
 * the *device* would not keep it.
 */
export type ConnectionResult =
  | {
      readonly kind: 'configured';
      /** What the token showed, ready to be offered for linking. */
      readonly accounts: readonly MonobankAccount[];
      /**
       * Whether those accounts also reached storage. A false here is not a failed connection:
       * the token is kept, and the next opening refetches. It exists so the screen can say the
       * cached list is older than what it is showing.
       */
      readonly cached: boolean;
    }
  | { readonly kind: 'invalid-token' }
  | { readonly kind: 'rate-limited' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'storage-unavailable' };

/** What a read of the current connection state answers with, before anything is attempted. */
export type ConnectionState =
  | { readonly kind: 'configured' }
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'storage-unavailable' };

/** Refreshing needs a token to refresh with; `not-configured` is the one extra answer it has. */
export type RefreshResult = ConnectionResult | { readonly kind: 'not-configured' };

/** Removing the token answers only whether the device let it go. */
export type RemovalResult = { readonly kind: 'ok' } | { readonly kind: 'storage-unavailable' };

/** The API's failure, carried through unchanged — the token was never part of it. */
function failure(outcome: Outcome<unknown>): Exclude<ConnectionResult, { kind: 'configured' }> {
  switch (outcome.kind) {
    case 'invalid-token':
      return { kind: 'invalid-token' };
    case 'rate-limited':
      return { kind: 'rate-limited' };
    default:
      return { kind: 'unavailable' };
  }
}

export function monobankConnection(ports: ConnectionPorts) {
  /**
   * Caches what a validated token showed. A database that refuses is not a failed connection —
   * the token is already safely kept and the accounts can be fetched again — so the failure is
   * swallowed into `cached: false` rather than thrown at a screen that could do nothing with it.
   */
  function cache(accounts: readonly MonobankAccount[]): boolean {
    try {
      ports.cacheAccounts(accounts, ports.now());
      return true;
    } catch {
      return false;
    }
  }

  return {
    /** Whether a token is kept, without reading anything else — what the route opens on. */
    async state(): Promise<ConnectionState> {
      const stored = await ports.tokenStore.read();
      if (stored.kind === 'unavailable') {
        return { kind: 'storage-unavailable' };
      }
      return stored.token ? { kind: 'configured' } : { kind: 'not-configured' };
    },

    /**
     * Validates a candidate and, only if monobank reads it, keeps it. Used both for the first
     * token and for a replacement: the old one is overwritten by a successful write and by
     * nothing else, so a rejected replacement leaves the working connection alone.
     */
    async submit(candidate: string): Promise<ConnectionResult> {
      const answer = await fetchClientInfo(ports.fetch, candidate);
      if (answer.kind !== 'ok') {
        return failure(answer);
      }
      const written = await ports.tokenStore.save(candidate);
      if (written.kind === 'unavailable') {
        // The token is good and the device would not keep it. Nothing was replaced or removed.
        return { kind: 'storage-unavailable' };
      }
      return { kind: 'configured', accounts: answer.value, cached: cache(answer.value) };
    },

    /**
     * Asks monobank again with the token already kept. An `invalid-token` here is what the screen
     * turns into "replace the token" — it is deliberately not a removal: the owner may have
     * revoked it in the bank's app and be about to paste a new one, and deleting first would
     * leave them with nothing if the new one is mistyped.
     */
    async refresh(): Promise<RefreshResult> {
      const stored = await ports.tokenStore.read();
      if (stored.kind === 'unavailable') {
        return { kind: 'storage-unavailable' };
      }
      if (!stored.token) {
        return { kind: 'not-configured' };
      }
      const answer = await fetchClientInfo(ports.fetch, stored.token);
      if (answer.kind !== 'ok') {
        return failure(answer);
      }
      return { kind: 'configured', accounts: answer.value, cached: cache(answer.value) };
    },

    /**
     * Removes the token and only the token. No рахунок, транзакція, link, imported item id,
     * опис or last known баланс банку is touched — this function cannot reach any of them, which
     * is the strongest form of that promise available.
     */
    async remove(): Promise<RemovalResult> {
      const removed = await ports.tokenStore.remove();
      return removed.kind === 'ok' ? { kind: 'ok' } : { kind: 'storage-unavailable' };
    },
  };
}

export type MonobankConnection = ReturnType<typeof monobankConnection>;
