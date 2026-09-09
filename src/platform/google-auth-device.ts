import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import { journal } from '../ui/journal';
import {
  DRIVE_APPDATA_SCOPE,
  GOOGLE_AUTH_KEY,
  googleConnectEnding,
  type GoogleAccessToken,
  type GoogleAuthPort,
  type GoogleAuthorisation,
} from './google-auth';

/**
 * The owner's Google account, through `expo-auth-session`'s PKCE flow in the system browser
 * (design D2). Never imported by a test: `verify` runs no native module, and this whole file is
 * proven on the emulator with a real account (smoke task 10.1).
 *
 * There is no client secret and there cannot be one. An installed-app OAuth client of the Android
 * type is bound to the package name and the signing certificate instead, which is why this flow is
 * the only one that can live in a public repo: the client id below is configuration, not a
 * credential, and nothing here would ever have to go into `.env` or past `guard-bash.sh`.
 *
 * What is kept, and where: the **refresh** authorisation goes into `expo-secure-store` under a
 * versioned key and is never returned to a caller — the port has no method that could. Access
 * tokens are fetched from it per request and held nowhere. That is the whole reason `accessToken()`
 * exists as a separate call rather than the connection handing something back once.
 */

/**
 * Google's endpoints, written out rather than discovered.
 *
 * Discovery is one more request that can fail, on a path where a failure would read as «no
 * network» on the owner's very first attempt. These two URLs have been stable for a decade.
 */
const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

/**
 * What is asked of the account: the app's own folder, plus who the owner is.
 *
 * `openid email` covers no file and no document — it is what lets the section say *which* Google
 * account holds the версії бекапу, which its spec requires. The one scope that touches Drive is
 * still `drive.appdata` and still only the app's own hidden folder (design D3).
 */
const SCOPES = [DRIVE_APPDATA_SCOPE, 'openid', 'email'];

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false,
};

/**
 * The OAuth client id, from `app.json`'s `extra` — public configuration the owner records once
 * (task 2.3). Absent on a tree where that has not happened, and `not-configured` is what the app
 * then says: a real state with its own sentence, rather than a network failure that never occurred.
 */
function clientId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { googleOAuthClientId?: unknown } | undefined;
  const id = extra?.googleOAuthClientId;
  return typeof id === 'string' && id !== '' ? id : undefined;
}

/**
 * The redirect the Google Android client requires: the client id reversed, as its own scheme.
 *
 * Derived here rather than written down twice — `app.json`'s `scheme` array must carry the same
 * value, and two hand-copied strings that must match is a defect waiting for a rebuild.
 */
function redirectUri(id: string): string {
  const reversed = id.replace(/\.apps\.googleusercontent\.com$/, '');
  return `com.googleusercontent.apps.${reversed}:/oauthredirect`;
}

/** The `email` claim of an id_token, without verifying it — it came from Google's own endpoint
 *  over TLS, so the signature would prove nothing this connection has not already established. */
function emailOf(idToken: string | undefined): string | undefined {
  if (!idToken) return undefined;
  const payload = idToken.split('.')[1];
  if (!payload) return undefined;
  try {
    const json = JSON.parse(
      // base64url → base64, then the platform's own decoder.
      globalThis.atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')),
    ) as { email?: unknown };
    return typeof json.email === 'string' ? json.email : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a thrown fetch was the network being absent rather than Google refusing. */
function looksOffline(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /network|fetch|timeout|ENOTFOUND|ECONN/i.test(message);
}

/** The exchange itself, unchanged — `authorise` below is this with the журнал around it. */
async function connect(): Promise<GoogleAuthorisation> {
  const id = clientId();
  if (!id) {
    return { kind: 'not-configured' };
  }

  let result: AuthSession.AuthSessionResult;
  let request: AuthSession.AuthRequest;
  try {
    request = new AuthSession.AuthRequest({
      clientId: id,
      scopes: SCOPES,
      redirectUri: redirectUri(id),
      // PKCE, which is what makes a secretless client safe: the code that comes back is
      // redeemable only by the app that started the flow.
      usePKCE: true,
      extraParams: {
        // Without these two Google issues no refresh token, and a daily backup would need the
        // owner at the consent screen every hour.
        access_type: 'offline',
        prompt: 'consent',
      },
    });
    result = await request.promptAsync(DISCOVERY);
  } catch (error) {
    return looksOffline(error) ? { kind: 'no-network' } : { kind: 'refused' };
  }

  if (result.type === 'cancel' || result.type === 'dismiss') {
    // The owner backed out. Nothing is kept and nothing is claimed.
    return { kind: 'cancelled' };
  }
  if (result.type !== 'success') {
    return { kind: 'refused' };
  }

  const code = result.params.code;
  if (!code) {
    return { kind: 'refused' };
  }

  try {
    const tokens = await AuthSession.exchangeCodeAsync(
      {
        clientId: id,
        code,
        redirectUri: redirectUri(id),
        extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : {},
      },
      DISCOVERY,
    );
    if (!tokens.refreshToken) {
      // Without a refresh token nothing can run in the background, so this is not a connection
      // worth claiming — better refused now than silently dead in a day.
      return { kind: 'refused' };
    }
    await SecureStore.setItemAsync(GOOGLE_AUTH_KEY, tokens.refreshToken, OPTIONS);
    // The label is returned and not kept here: `drive_backup.account_label` is where the section
    // reads it from, and one copy is one place for it to be wrong.
    return { kind: 'ok', accountLabel: emailOf(tokens.idToken) ?? 'Google' };
  } catch (error) {
    return looksOffline(error) ? { kind: 'no-network' } : { kind: 'refused' };
  }
}

export const googleAuth: GoogleAuthPort = {
  /**
   * Recorded as an operation rather than as a request: the exchange goes through
   * `expo-auth-session`, not through a `fetch` this app owns, so there is no seam to journal
   * (design D5a). The word it ends with is `googleConnectEnding`'s, which is proven on the port —
   * this file is never loaded under `verify`, so a mapping written here would be one nobody checks.
   */
  authorise(): Promise<GoogleAuthorisation> {
    return journal.step('google-sign-in', connect, { ending: googleConnectEnding });
  },

  async accessToken(): Promise<GoogleAccessToken> {
    const id = clientId();
    if (!id) {
      return { kind: 'not-configured' };
    }

    let refreshToken: string | null;
    try {
      refreshToken = await SecureStore.getItemAsync(GOOGLE_AUTH_KEY, OPTIONS);
    } catch {
      // A keystore that cannot be reached is not an account that revoked us, but from here the
      // app can do nothing either way, and «підключіть знову» is the honest next step.
      return { kind: 'withdrawn' };
    }
    if (!refreshToken) {
      return { kind: 'withdrawn' };
    }

    try {
      const refreshed = await AuthSession.refreshAsync(
        { clientId: id, refreshToken, scopes: SCOPES },
        DISCOVERY,
      );
      return refreshed.accessToken
        ? { kind: 'ok', token: refreshed.accessToken }
        : { kind: 'withdrawn' };
    } catch (error) {
      // The two cases that must stay apart: a phone in a lift keeps its connection; an account
      // that revoked the app has to say so, and that is the same answer a seven-day *Testing*
      // expiry produces (design D3).
      return looksOffline(error) ? { kind: 'no-network' } : { kind: 'withdrawn' };
    }
  },

  async forget(): Promise<void> {
    // Deliberately not `revokeAsync`: revoking needs the network, and disconnecting must work on a
    // phone that has none. What leaves the phone is what this app controls; the owner can remove
    // the app at their Google account, and the версії бекапу in Drive are untouched either way.
    try {
      await SecureStore.deleteItemAsync(GOOGLE_AUTH_KEY, OPTIONS);
    } catch {
      // Nothing to report and nothing to retry: the port promises removal, and a keystore that
      // refuses has already lost the value's usefulness.
    }
  },
};
