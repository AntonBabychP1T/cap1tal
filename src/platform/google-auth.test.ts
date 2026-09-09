import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DRIVE_APPDATA_SCOPE,
  GOOGLE_AUTH_KEY,
  googleConnectEnding,
  inMemoryGoogleAuth,
  type GoogleAuthPort,
} from './google-auth';

/**
 * The port's contract, against the one implementation `verify` may load. Nothing here imports
 * `expo-auth-session` or `expo-web-browser`: the PKCE flow is exercised on a device with a real
 * Google account (smoke task 10.1), and every rule about *what the app does with* the
 * authorisation is proven here and in `src/backup/drive/connection.test.ts`.
 */

/** A value shaped like a real access token, and never a real one. */
const TOKEN = 'ya29.TEST_ACCESS_TOKEN_valueeeeeeeeeeeeeee';

describe('connecting to the owner’s Google account', () => {
  it("Scenario: Connecting asks for the app's own folder only", () => {
    // The spec's "connecting asks for the app's own folder only" is this constant plus the parent
    // in `drive.ts`. Asserted rather than trusted, because widening it is one word.
    expect(DRIVE_APPDATA_SCOPE).toBe('https://www.googleapis.com/auth/drive.appdata');
    expect(DRIVE_APPDATA_SCOPE).not.toContain('drive.readonly');
    expect(DRIVE_APPDATA_SCOPE.endsWith('/drive')).toBe(false);
  });

  it('Scenario: A cancelled connection leaves nothing behind', async () => {
    const port: GoogleAuthPort = inMemoryGoogleAuth();

    // The owner backed out of the consent screen: not a failure, and nothing kept.
    expect(await port.authorise()).toEqual({ kind: 'cancelled' });
    // Nothing was kept, so nothing can be asked for afterwards.
    expect(await port.accessToken()).toEqual({ kind: 'withdrawn' });
  });

  it('A refusal by Google is not the owner cancelling', async () => {
    const refused = inMemoryGoogleAuth({ authorisation: { kind: 'refused' } });

    // Two different sentences for the owner: one is «ви скасували», the other is «Google
    // відмовив». Collapsing them would tell the owner they did something they did not.
    expect(await refused.authorise()).toEqual({ kind: 'refused' });
    expect(refused.held()).toBe(false);
  });

  it('Scenario: No network is a reported state', async () => {
    const offline = inMemoryGoogleAuth({
      authorisation: { kind: 'ok', accountLabel: 'owner@example.com' },
      offline: true,
    });

    expect(await offline.authorise()).toEqual({ kind: 'no-network' });
    expect(await offline.accessToken()).toEqual({ kind: 'no-network' });
    // Not "withdrawn": a phone in a lift has not lost its authorisation, and telling the owner to
    // connect again would be wrong and would cost them the connection they have.
    expect(await offline.accessToken()).not.toEqual({ kind: 'withdrawn' });
  });

  it('A build with no OAuth client says so rather than inventing a failure', async () => {
    const unconfigured = inMemoryGoogleAuth({ authorisation: { kind: 'not-configured' } });

    // The state this very tree is in until the owner creates the Google Cloud client (task 2.3).
    // Reporting it as a network failure would send them looking in the wrong place.
    expect(await unconfigured.authorise()).toEqual({ kind: 'not-configured' });
  });

  it('A completed connection names the account and nothing else about it', async () => {
    const port = inMemoryGoogleAuth({
      authorisation: { kind: 'ok', accountLabel: 'owner@example.com' },
      token: TOKEN,
    });

    expect(await port.authorise()).toEqual({ kind: 'ok', accountLabel: 'owner@example.com' });
    expect(port.held()).toBe(true);
    expect(await port.accessToken()).toEqual({ kind: 'ok', token: TOKEN });
  });
});

describe('the authorisation is a device secret', () => {
  it('never appears in an outcome, an error or a returned value', async () => {
    const port = inMemoryGoogleAuth({
      authorisation: { kind: 'ok', accountLabel: 'owner@example.com' },
      token: TOKEN,
    });

    const answers = [await port.authorise(), await port.accessToken(), await port.forget()];

    // The account label is the only thing about the authorisation that is ever returned, and it is
    // there so the section can say which account holds the версії бекапу.
    expect(JSON.stringify(answers[0])).toBe('{"kind":"ok","accountLabel":"owner@example.com"}');
    // The port has no method that returns the refresh authorisation — the thing that would let
    // someone read the owner's Drive for months. `accessToken` returns a short-lived token only.
    expect(Object.keys(port).filter((key) => key !== 'held')).toEqual([
      'authorise',
      'accessToken',
      'forget',
    ]);
  });

  it('Scenario: Withdrawn access stops the claim of being connected', async () => {
    const withdrawn = inMemoryGoogleAuth({
      authorisation: { kind: 'ok', accountLabel: 'owner@example.com' },
      withdrawn: true,
    });
    await withdrawn.authorise();

    // The owner revoked the app at their Google account. The port reports it; what the app does
    // about it — stop presenting itself as connected — belongs to the run that asked.
    expect(await withdrawn.accessToken()).toEqual({ kind: 'withdrawn' });
    // And it is the same answer a seven-day *Testing* expiry produces (design D3), so the app
    // degrades into «підключіть знову» rather than into silence.
  });

  it('Scenario: Disconnecting removes it', async () => {
    const port = inMemoryGoogleAuth({
      authorisation: { kind: 'ok', accountLabel: 'owner@example.com' },
      token: TOKEN,
    });
    await port.authorise();

    await port.forget();

    expect(port.held()).toBe(false);
    // No further upload can be made: there is no token to make one with.
    expect(await port.accessToken()).toEqual({ kind: 'withdrawn' });
  });

  it('The key is versioned, so a later format cannot read this one', () => {
    expect(GOOGLE_AUTH_KEY).toBe('cap1tal.drive.google-authorisation.v1');
  });
});

describe('what `verify` may load', () => {
  it('The port itself pulls in no React, no Expo and no database', () => {
    const source = readFileSync(new URL('./google-auth.ts', import.meta.url), 'utf8');
    const imported = [...source.matchAll(/^\s*import[^']*'([^']+)'/gm)].map(([, from]) => from);

    expect(imported).toEqual([]);
    for (const forbidden of ['react', 'react-native', 'expo', '@/db/', '../db/']) {
      expect(source).not.toContain(`'${forbidden}`);
    }
  });
});

describe('what the журнал records about the sign-in', () => {
  const adapter = readFileSync(new URL('./google-auth-device.ts', import.meta.url), 'utf8');

  it("records a refused exchange by its own enumerated reason", () => {
    expect(googleConnectEnding({ kind: 'refused' })).toEqual({ detail: 'refused' });
    expect(googleConnectEnding({ kind: 'no-network' })).toEqual({ detail: 'no-network' });
    expect(googleConnectEnding({ kind: 'cancelled' })).toEqual({ detail: 'cancelled' });
    expect(googleConnectEnding({ kind: 'not-configured' })).toEqual({ detail: 'not-configured' });
  });

  it('carries no URL, no code and no account label', () => {
    const ending = googleConnectEnding({ kind: 'ok', accountLabel: 'власник@gmail.com' });

    expect(ending).toEqual({ detail: 'ok' });
    expect(JSON.stringify(ending)).not.toContain('власник@gmail.com');
  });

  it('is the adapter\'s only decision about what to record', () => {
    // The wrapping is one line and the mapping is this file's — an adapter `verify` never loads
    // must hold no rule of its own (design D5).
    expect(adapter).toContain("journal.step('google-sign-in', connect, { ending: googleConnectEnding })");
  });
});
