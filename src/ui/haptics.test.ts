import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  choiceEvent,
  HAPTIC_EFFECTS,
  hapticFor,
  strongestHaptic,
  syncOutcomeEvent,
  type HapticEvent,
} from './haptics';

const ON = { enabled: true };
const OFF = { enabled: false };

const EVENTS: HapticEvent[] = [
  'stored',
  'removed',
  'merged',
  'rule-accepted',
  'scanned',
  'refused',
  'failed',
  'stepped',
  'chosen',
  'toggled',
];

describe('the system effect each meaning plays', () => {
  it('maps confirm, reject and tick to the design D13 constants and fallbacks', () => {
    expect(HAPTIC_EFFECTS).toEqual({
      confirm: {
        android: 'Confirm',
        androidFallback: 'Context_Click',
        ios: { call: 'notificationAsync', type: 'Success' },
      },
      reject: {
        android: 'Reject',
        androidFallback: 'Long_Press',
        ios: { call: 'notificationAsync', type: 'Error' },
      },
      tick: { android: 'Segment_Tick', androidFallback: 'Clock_Tick', ios: { call: 'selectionAsync' } },
    });
  });

  it('plays only the view’s own haptic feedback on Android, never the vibrator', () => {
    // `VIBRATE` is blocked in `app.json`, so a call that needs it would fail on the phone: the
    // adapter is read as text, since it loads a native module and no test may import it.
    const adapter = readFileSync(
      fileURLToPath(new URL('../platform/haptics-device.ts', import.meta.url)),
      'utf8',
    );
    const android = adapter.slice(adapter.indexOf('function playAndroid'), adapter.indexOf('function playIos'));
    expect(android).toContain('performAndroidHapticsAsync(AndroidHaptics[android])');
    expect(android).toContain('performAndroidHapticsAsync(AndroidHaptics[androidFallback])');
    expect(android).not.toMatch(/notificationAsync|selectionAsync|impactAsync|Vibration/);
    expect(adapter).not.toContain('impactAsync');
    // Retried once, then swallowed: never an error the owner sees.
    expect(android.match(/\.catch\(/g)).toHaveLength(2);
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../app.json', import.meta.url)), 'utf8'),
    ) as { expo: { android: { blockedPermissions: string[] } } };
    expect(manifest.expo.android.blockedPermissions).toContain('android.permission.VIBRATE');
  });
});

describe('hapticFor', () => {
  it('Scenario: Storing a транзакція is felt', () => {
    expect(hapticFor('stored', ON)).toBe('confirm');
    expect(hapticFor('removed', ON)).toBe('confirm');
    expect(hapticFor('merged', ON)).toBe('confirm');
    expect(hapticFor('rule-accepted', ON)).toBe('confirm');
  });

  it('Scenario: A refusal is felt differently', () => {
    expect(hapticFor('refused', ON)).toBe('reject');
    expect(hapticFor('failed', ON)).toBe('reject');
    expect(hapticFor('refused', ON)).not.toBe(hapticFor('stored', ON));
  });

  it('Scenario: A found чек is felt', () => {
    expect(hapticFor('scanned', ON)).toBe('confirm');
  });

  it('Scenario: Stepping a month ticks', () => {
    expect(hapticFor('stepped', ON)).toBe('tick');
    expect(hapticFor('chosen', ON)).toBe('tick');
    expect(hapticFor('toggled', ON)).toBe('tick');
  });

  it('Scenario: Vibration off plays nothing', () => {
    for (const event of EVENTS) expect(hapticFor(event, OFF), event).toBeNull();
  });

  it('Scenario: Vibration is on from the start', () => {
    // «On» is what an untouched preference reads as (`haptics-preference-repo`); with it every
    // event plays its effect.
    for (const event of EVENTS) expect(hapticFor(event, ON), event).not.toBeNull();
  });
});

describe('choiceEvent', () => {
  it('plays nothing when a chip or a Choices option re-picks the current value', () => {
    expect(choiceEvent('UAH', 'UAH', 'chosen')).toBeNull();
    expect(choiceEvent('UAH', 'USD', 'chosen')).toBe('chosen');
    expect(choiceEvent(true, false, 'toggled')).toBe('toggled');
    expect(choiceEvent('2026-09', '2026-09', 'stepped')).toBeNull();
  });
});

describe('syncOutcomeEvent', () => {
  it('Scenario: A cancelled прогін does not vibrate', () => {
    const stopped = {
      kind: 'ran' as const,
      imported: 1,
      accounts: [
        { monobankAccountId: 'a', accountId: 'card', outcome: 'complete' as const, imported: 1 },
        { monobankAccountId: 'b', accountId: 'jar', outcome: 'cancelled' as const, imported: 0 },
      ],
    };
    expect(syncOutcomeEvent(stopped)).toBeNull();
    // Перенесено is not a failure either.
    expect(
      syncOutcomeEvent({
        ...stopped,
        accounts: [{ monobankAccountId: 'b', accountId: 'jar', outcome: 'postponed', imported: 0 }],
      }),
    ).toBeNull();
    // A рахунок that ends in an error makes the прогін a failure, which plays reject.
    const failed = syncOutcomeEvent({
      ...stopped,
      accounts: [{ monobankAccountId: 'b', accountId: 'jar', outcome: 'unavailable', imported: 0 }],
    });
    expect(failed).toBe('failed');
    expect(hapticFor(failed!, ON)).toBe('reject');
    // A прогін with nothing set up attempted nothing.
    expect(syncOutcomeEvent({ kind: 'not-configured' })).toBeNull();
  });
});

describe('strongestHaptic', () => {
  it('plays one effect per owner action, an outcome over a tick', () => {
    // A категорія picked on a feed line: the chip ticks, the store confirms — only the store plays.
    expect(strongestHaptic(['tick', 'confirm'])).toBe('confirm');
    expect(strongestHaptic(['confirm', 'reject'])).toBe('reject');
    expect(strongestHaptic(['tick', 'tick'])).toBe('tick');
    expect(strongestHaptic([])).toBeNull();
  });
});
