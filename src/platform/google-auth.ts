/**
 * The seam between the app and the owner's Google account. The port and its test double only — the
 * device adapter is `google-auth-device.ts` (PKCE through `expo-auth-session`, the authorisation
 * kept in `expo-secure-store`), and it is not imported from here.
 *
 * The rule this port exists to make unbreakable: **the authorisation Google issued never leaves
 * the device layer.** No outcome carries it, no error message names it, and there is no method
 * that hands it back. `accessToken()` returns a short-lived access token because the Drive port
 * needs one for a header — the refresh authorisation behind it, which is the thing that would let
 * someone read the owner's Drive for months, is never returned by anything here.
 *
 * Failures are values, exactly as in `src/monobank/api.ts`. A cancelled consent screen, a Google
 * account that refused, a phone with no network and an authorisation that has been withdrawn are
 * four different answers the section shows, not one exception to catch — and the withdrawn one is
 * the same state design D3 warns a seven-day *Testing* expiry produces, so the app degrades into
 * a visible «підключіть знову» and never into silent data loss.
 */

/** One versioned key on the device. Versioned so a later format change cannot read this one. */
export const GOOGLE_AUTH_KEY = 'cap1tal.drive.google-authorisation.v1';

/**
 * The scope asked of the owner's account: the app's own hidden folder and nothing else (design
 * D3). Named here rather than in the adapter so a test can hold the app to it — the spec's
 * "connecting asks for the app's own folder only" is this constant and the parent in `drive.ts`.
 */
export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/**
 * What connecting can come to.
 *
 * `cancelled` is the owner backing out of the consent screen — nothing was kept and nothing is
 * claimed. `refused` is Google saying no, which is not the same thing and not the owner's doing.
 * `not-configured` is this build having no OAuth client id: not a state a released app can be in,
 * but exactly the state a tree without the owner's Google Cloud client is in, and saying so beats
 * reporting a network failure that did not happen.
 */
export type GoogleAuthorisation =
  | { readonly kind: 'ok'; readonly accountLabel: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'refused' }
  | { readonly kind: 'no-network' }
  | { readonly kind: 'not-configured' };

/**
 * What asking for a usable access token can come to.
 *
 * `withdrawn` is the state the whole "stop presenting yourself as connected" requirement hangs on:
 * the owner revoked the app at their Google account, or the authorisation expired. It is not an
 * error to retry — it is a fact the section reports with a way out.
 */
export type GoogleAccessToken =
  | { readonly kind: 'ok'; readonly token: string }
  | { readonly kind: 'withdrawn' }
  | { readonly kind: 'no-network' }
  | { readonly kind: 'not-configured' };

/**
 * What the sign-in's ending entry says: the outcome's own word, and nothing else.
 *
 * The app reaches Google through `expo-auth-session`'s `exchangeCodeAsync`, not through a request
 * port this app owns, so there is no `fetch` seam to journal and the reach is recorded as an
 * operation instead (design D5a). That matters rather than being a technicality: the репорт that
 * prompted `journal-diagnostics` carried four «збій · backup · not-configured» entries and nothing
 * about why, and the exchange is the likeliest place that answer lives.
 *
 * Pure, and here on the port rather than in the adapter, because `google-auth-device.ts` is never
 * loaded under `verify` — an assertion about a mapping written inside it would be an assertion
 * nobody checks (design D5). Only the outcome's own enumerated word: no URL, no authorisation
 * code, no account label.
 */
export function googleConnectEnding(outcome: GoogleAuthorisation): { readonly detail: string } {
  return { detail: outcome.kind };
}

export interface GoogleAuthPort {
  /**
   * Takes the owner through their Google account and keeps what comes back. The account label is
   * for the screen to show which account holds the версії бекапу — an email address, and the only
   * thing about the authorisation that is ever returned.
   */
  authorise(): Promise<GoogleAuthorisation>;
  /** A short-lived token for one Drive request. Never the refresh authorisation behind it. */
  accessToken(): Promise<GoogleAccessToken>;
  /** Removes the authorisation from the phone. Touches no key, no version in Drive, no local data. */
  forget(): Promise<void>;
}

/**
 * The port the tests use, and the only implementation `verify` ever loads.
 *
 * `authorisation` is what the owner's Google account would answer; leaving it out is an owner who
 * backed out of the consent screen. `token` is what `accessToken()` answers with while connected —
 * setting `withdrawn` makes it answer as an account that revoked the app, which is the state the
 * spec's "withdrawn access stops the claim of being connected" is proven against.
 */
export function inMemoryGoogleAuth(
  options: {
    readonly authorisation?: Exclude<GoogleAuthorisation, { kind: 'ok' }> | { kind: 'ok'; accountLabel: string };
    readonly token?: string;
    readonly withdrawn?: boolean;
    readonly offline?: boolean;
  } = {},
): GoogleAuthPort & {
  /** Whether the phone currently holds an authorisation — what `forget()` is asserted against. */
  readonly held: () => boolean;
} {
  let held = false;

  return {
    authorise: async () => {
      const answer: GoogleAuthorisation = options.offline
        ? { kind: 'no-network' }
        : (options.authorisation ?? { kind: 'cancelled' });
      // Only a completed authorisation is kept. A cancelled or refused one leaves nothing behind,
      // which is the spec's "a cancelled connection leaves nothing behind" at this layer.
      if (answer.kind === 'ok') {
        held = true;
      }
      return answer;
    },

    accessToken: async () => {
      if (options.offline) {
        return { kind: 'no-network' };
      }
      if (options.withdrawn) {
        // Deliberately not `forget()`-ing here: the port reports, and what the app does about it
        // — stop claiming to be connected — belongs to the run that asked, where it is tested.
        return { kind: 'withdrawn' };
      }
      if (!held) {
        return { kind: 'withdrawn' };
      }
      return { kind: 'ok', token: options.token ?? 'test-access-token' };
    },

    forget: async () => {
      held = false;
    },

    held: () => held,
  };
}
