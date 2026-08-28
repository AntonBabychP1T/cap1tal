/**
 * The seam between the app and wherever the owner's monobank token actually lives. The port and
 * its test double only — the platform adapters are `monobank-token-store.ts` (native, backed by
 * `expo-secure-store`) and `monobank-token-store.web.ts` (unavailable, stores nothing), and
 * neither is imported from here.
 *
 * That separation is the point. Nothing under `npm run verify` may load a native module, so the
 * port and the double live in a file no platform code touches, and every rule about the token —
 * validate before keeping, never reveal it again, keep the old one until a replacement is proven —
 * is proven against `inMemoryMonobankTokenStore` in `src/monobank/connection.ts`'s tests.
 *
 * Failures are values here, exactly as they are in `src/monobank/api.ts`: secure storage can be
 * missing or refuse, and that is an answer the screen shows, not an exception to catch. The token
 * itself appears in no outcome, no error message and no log — the only place it goes is the
 * `X-Token` header of a personal-API request.
 */

/** One versioned key on the device. Versioned so a later format change cannot read this one. */
export const MONOBANK_TOKEN_KEY = 'cap1tal.monobank.personal-token.v1';

/** What a read of the store can say. `token` absent means no token is kept — not a failure. */
export type TokenRead =
  | { readonly kind: 'ok'; readonly token?: string }
  | { readonly kind: 'unavailable' };

/** What a write or a removal can say. Neither ever hands the value back. */
export type TokenWrite = { readonly kind: 'ok' } | { readonly kind: 'unavailable' };

export interface MonobankTokenStore {
  /** The stored token, if the device holds one and secure storage could be reached. */
  read(): Promise<TokenRead>;
  /**
   * Keeps a token that has already been validated. A caller that saves an unvalidated candidate
   * is the one bug this port cannot prevent — `src/monobank/connection.ts` is the only caller,
   * and it validates first.
   */
  save(token: string): Promise<TokenWrite>;
  /** Removes the key and nothing else: no рахунок, транзакція, link, item id or balance. */
  remove(): Promise<TokenWrite>;
}

/**
 * The store the tests use, and the only implementation `verify` ever loads. `unavailable` makes
 * every call answer as a device whose secure storage cannot be reached would — the state that
 * must leave a working token alone rather than destroy it.
 */
export function inMemoryMonobankTokenStore(
  options: { readonly token?: string; readonly unavailable?: boolean } = {},
): MonobankTokenStore {
  let kept: string | undefined = options.token;
  const unavailable = options.unavailable ?? false;

  return {
    read: async () => (unavailable ? { kind: 'unavailable' } : { kind: 'ok', ...(kept ? { token: kept } : {}) }),
    save: async (token: string) => {
      if (unavailable) {
        return { kind: 'unavailable' };
      }
      kept = token;
      return { kind: 'ok' };
    },
    remove: async () => {
      if (unavailable) {
        return { kind: 'unavailable' };
      }
      kept = undefined;
      return { kind: 'ok' };
    },
  };
}
