import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { CapturedNotification } from '../notifications/capture';
import { KNOWN_BANK_APPS } from '../ui/notification-settings';
import {
  inMemoryNotificationCapture,
  monobankPackagesIn,
  MONOBANK_PACKAGE_PREFIX,
  type NotificationCapturePort,
} from './notification-capture';

/**
 * The port only — the device adapter and the native module are never loaded here, and must never
 * be: `verify` runs no native module and no React Native. What is proven here is the monobank
 * refusal, which is a pure rule, and the delivery contract the double honours, which is what the
 * follow-up change's draining code will be written against. The bound, the watched filter and
 * reboot persistence live in Kotlin and are proven on the emulator (tasks 5.2–5.3).
 */

/** A notification shaped like one a bank posts, and never a real capture. */
function capture(overrides: Partial<CapturedNotification> = {}): CapturedNotification {
  return {
    packageName: 'ua.privatbank.ap24',
    postedAt: 1_756_000_000_000,
    title: 'Оплата',
    text: 'Картка *1234, 125.50 UAH, СІЛЬПО',
    ...overrides,
  };
}

describe('the packages a watched set may never name', () => {
  it('Scenario: A watched set naming monobank is refused', async () => {
    const port: NotificationCapturePort = inMemoryNotificationCapture();

    expect(await port.setWatched(['ua.privatbank.ap24'])).toEqual({ kind: 'ok' });
    // The refusal names what offended, so a screen can say which app it will not watch…
    expect(await port.setWatched(['ua.privatbank.ap24', MONOBANK_PACKAGE_PREFIX])).toEqual({
      kind: 'refused',
      packages: [MONOBANK_PACKAGE_PREFIX],
    });
  });

  it('Scenario: A watched set naming monobank is refused — the set stays as it was', async () => {
    const port = inMemoryNotificationCapture();
    await port.setWatched(['ua.privatbank.ap24']);

    await port.setWatched(['ua.privatbank.ap24', 'com.ftband.mono.beta']);

    // Not "the allowed part of it": a refused instruction changes nothing, so the screen and the
    // device cannot end up disagreeing about which apps are watched.
    expect(port.watched()).toEqual(['ua.privatbank.ap24']);
    expect(port.setWatchedCalls()).toEqual([['ua.privatbank.ap24']]);
  });

  it('The whole monobank package family is refused, and nothing else is', () => {
    expect(MONOBANK_PACKAGE_PREFIX).toBe('com.ftband.mono');
    expect(monobankPackagesIn([MONOBANK_PACKAGE_PREFIX])).toEqual([MONOBANK_PACKAGE_PREFIX]);
    // A flavour under the same family is the same duplicate path, so the rule is a prefix…
    expect(monobankPackagesIn(['com.ftband.mono.beta'])).toEqual(['com.ftband.mono.beta']);
    // …and another bank whose name merely resembles it is watchable like any other.
    expect(monobankPackagesIn(['ua.privatbank.ap24', 'com.ftbandmono', 'mono.com.ftband'])).toEqual(
      [],
    );
  });
});

describe('the delivery contract the double honours', () => {
  it('Scenario: Captures outlive the app process', async () => {
    const older = capture({ postedAt: 1 });
    const newer = capture({ postedAt: 2 });
    // Both were captured while no JavaScript of ours was running; the first collection sees them.
    const port = inMemoryNotificationCapture({ queue: [older, newer] });

    expect(await port.collect()).toEqual([older, newer]);
  });

  it('Scenario: Collecting without acknowledging redelivers', async () => {
    const waiting = capture();
    const port = inMemoryNotificationCapture({ queue: [waiting] });

    expect(await port.collect()).toEqual([waiting]);
    // A crash between collecting and storing loses nothing: the same record is still waiting.
    expect(await port.collect()).toEqual([waiting]);
  });

  it('Scenario: After acknowledgement nothing returns', async () => {
    const port = inMemoryNotificationCapture({ queue: [capture()] });
    const collected = await port.collect();

    await port.acknowledge(collected.length);

    expect(await port.collect()).toEqual([]);
    expect(port.waiting()).toEqual([]);
  });

  it('Scenario: A capture during processing survives the acknowledgement', async () => {
    const handedOver = capture({ postedAt: 1, text: 'перша' });
    const during = capture({ postedAt: 2, text: 'друга' });
    const port = inMemoryNotificationCapture({ queue: [handedOver] });
    const collected = await port.collect();

    // The phone hears one more while the app is still storing the first…
    port.capture(during);
    await port.acknowledge(collected.length);

    // …and the acknowledgement forgets only what it was handed, never a blind count from the head.
    expect(await port.collect()).toEqual([during]);
  });

  it('An acknowledgement larger than the collection, or of nothing, forgets no more than it was handed', async () => {
    const first = capture({ postedAt: 1 });
    const second = capture({ postedAt: 2 });
    const port = inMemoryNotificationCapture({ queue: [first] });
    const collected = await port.collect();
    port.capture(second);

    await port.acknowledge(collected.length + 5);
    expect(port.waiting()).toEqual([second]);

    // And an acknowledgement with nothing behind it is a no-op rather than a wrong removal.
    await port.acknowledge(3);
    await port.acknowledge(-1);
    expect(port.waiting()).toEqual([second]);
  });
});

/**
 * Which of the known bank apps this phone has. The double answers the two ways a real device can:
 * a list, or `'unknown'` — and `'unknown'` is not an empty list, because the caller offers the
 * whole list when the question could not be asked.
 */
describe('which of the named packages the phone has', () => {
  const KNOWN = ['ua.privatbank.ap24', 'ua.oschadbank.online', 'ua.abank24.mobileapp'];

  it('A phone that was described answers with what it has, and nothing else', async () => {
    const port = inMemoryNotificationCapture({
      installed: ['ua.privatbank.ap24', 'com.example.unrelated'],
    });

    // Only the packages it was asked about: an app it was never asked about is not an answer.
    expect(await port.installedAmong(KNOWN)).toEqual(['ua.privatbank.ap24']);
  });

  it('A phone described as having none of them says so, which is not «unknown»', async () => {
    const port = inMemoryNotificationCapture({ installed: [] });

    expect(await port.installedAmong(KNOWN)).toEqual([]);
  });

  it('A double that was told nothing cannot answer', async () => {
    const port = inMemoryNotificationCapture();

    expect(await port.installedAmong(KNOWN)).toBe('unknown');
  });

  it('A build where capture cannot work cannot look either', async () => {
    const port = inMemoryNotificationCapture({
      unavailable: true,
      installed: ['ua.privatbank.ap24'],
    });

    expect(await port.installedAmong(KNOWN)).toBe('unknown');
  });
});

describe('a build where capture cannot work', () => {
  it('Scenario: Collecting where capture cannot work yields nothing', async () => {
    const port = inMemoryNotificationCapture({ queue: [capture()], unavailable: true });

    // Not a throw and not a hang: nothing is waiting, and the caller carries on.
    expect(await port.collect()).toEqual([]);
    await expect(port.acknowledge(1)).resolves.toBeUndefined();
  });

  it('Scenario: Telling the watched set where capture cannot work is a typed outcome', async () => {
    const port = inMemoryNotificationCapture({ unavailable: true });

    expect(await port.setWatched(['ua.privatbank.ap24'])).toEqual({ kind: 'unavailable' });
    // The refusal is a rule about what may ever be watched, so it still answers first — a build
    // that cannot capture must not turn "we will never watch monobank" into "maybe elsewhere".
    expect(await port.setWatched([MONOBANK_PACKAGE_PREFIX])).toEqual({
      kind: 'refused',
      packages: [MONOBANK_PACKAGE_PREFIX],
    });
  });
});

/**
 * The Kotlin half of the same promise, asserted the same way. Nothing captured may leave the
 * device, and the structural reason is that the module has nothing to leave with: no network
 * client, no socket, no URL. That is worth a test rather than a one-time reading, because the
 * import that breaks it is one line long and the file it would break is the one that holds every
 * notification the owner's phone has shown.
 *
 * Node reads the sources as text — no Kotlin runs, no native module loads, `verify` stays what it
 * is.
 */
it('Scenario: A captured notification exists only on the phone', () => {
  const directory = new URL(
    '../../modules/notification-capture/android/src/main/java/expo/modules/notificationcapture/',
    import.meta.url,
  );
  const sources = readdirSync(directory).filter((name) => name.endsWith('.kt'));

  expect(sources.length).toBeGreaterThan(0);
  for (const name of sources) {
    const source = readFileSync(new URL(name, directory), 'utf8');
    // Android itself, Expo's module runtime, one file API and one JSON parser. Nothing else.
    for (const [, imported] of source.matchAll(/^import\s+(\S+)/gm)) {
      expect(imported).toMatch(/^(android\.|androidx\.|expo\.modules\.|java\.io\.File|org\.json\.)/);
    }
    for (const forbidden of ['java.net', 'HttpURLConnection', 'Socket', 'okhttp', 'http://', 'https://']) {
      expect(source).not.toContain(forbidden);
    }
  }
});

/**
 * The same list of packages lives in two files: `KNOWN_BANK_APPS`, which is what the picker
 * offers, and the module manifest's `<queries>`, which is what Android will let the app see at
 * all. A package in one and not the other reads as "not installed" on every phone that has it,
 * silently — so the two are held together here rather than by remembering.
 *
 * Node reads the manifest as text: no Android, no Gradle, `verify` stays what it is.
 */
it('Every known bank app is a package the manifest asks to see', () => {
  const manifest = readFileSync(
    new URL('../../modules/notification-capture/android/src/main/AndroidManifest.xml', import.meta.url),
    'utf8',
  );
  const queries = manifest.slice(manifest.indexOf('<queries>'), manifest.indexOf('</queries>'));

  expect(queries).not.toBe('');
  for (const app of KNOWN_BANK_APPS) {
    expect(queries, `${app.packageName} is not in <queries>`).toContain(
      `<package android:name="${app.packageName}" />`,
    );
  }
  // By name, and only by name: the whole-phone permission is what a named list exists to avoid.
  // Matched as a declaration, so the comment explaining why it is absent does not count as one.
  expect(manifest).not.toMatch(/<uses-permission[^>]*QUERY_ALL_PACKAGES/);
});

/**
 * The port has to stay loadable by `verify`, which runs no React Native, no Expo module and no
 * database. Asserted on the source rather than trusted, because the import that breaks it is the
 * easy one to add — and this is the file every rule about capture is proven against. The engine's
 * record type is the one allowed import: pure TypeScript, and the seam itself.
 */
it('The port itself pulls in no React, no Expo and no database', () => {
  const source = readFileSync(new URL('./notification-capture.ts', import.meta.url), 'utf8');
  const imported = [...source.matchAll(/^\s*import[^']*'([^']+)'/gm)].map(([, from]) => from);

  expect(imported).toEqual(['../notifications/capture']);
  for (const forbidden of ['react', 'react-native', 'expo', '@/db/', '../db/']) {
    expect(source).not.toContain(`'${forbidden}`);
  }
});
